import test from 'node:test';
import assert from 'node:assert/strict';
import { stateAt, point, inverse, mul, rotate, translate, scale, validateRig, validateClip, sample } from '../core/engine.mjs';
import { vertices, triangles, triangleMatrix, deformPoint, deformationJacobian } from '../core/mesh.mjs';
import { secondaryAngle } from '../core/secondary.mjs';
import { resizePart } from '../core/edit.mjs';
const near = (a,b,tolerance=1e-9) => assert.ok(Math.abs(a-b)<tolerance, `${a} != ${b}`);
const pair = (a,b,tolerance=1e-9) => a.forEach((v,i)=>near(v,b[i],tolerance));
const part = (id,parent,position,pivot=[0,0]) => ({id,parent,position,pivot,size:[100,80],asset:'/animations/test/part.png',z:0});
const rig = () => ({version:1,canvas:[777,333],origin:[317,149],ground:290,parts:[part('root',null,[5,8],[50,10]),part('child','root',[30,0],[7,9])]});
const clip = () => ({id:'test',name:'Test',fps:24,duration:2,tracks:[]});
test('arbitrary canvas and parent ordering match a hand-computed nested scaled rotation',()=>{
  const r=rig(), c=clip(); r.parts[0].rotation=90; r.parts[0].scaleX=2; r.parts[0].scaleY=.5;
  r.parts[1].rotation=-90; r.parts.reverse();
  const child=stateAt(r,c,.5).find(p=>p.id==='child');
  pair(child.joint,[322,217]);
  // Child image point offset (3,4): child rotation -> (4,-3), parent
  // anisotropic scale -> (8,-1.5), parent 90° -> (1.5,8).
  pair(point(child.matrix,[10,13]),[323.5,225]);
});
test('inverse affine transform recovers arbitrary local pixels through nested transforms',()=>{
  const m=mul(translate(900,-200),mul(rotate(37),mul(scale(.7,2.3),translate(-11,43))));
  for(const p of [[0,0],[-999,500],[.123,.987],[2048,2048]]) pair(point(inverse(m),point(m,p)),p,1e-8);
  assert.throws(()=>inverse([1,2,2,4,0,0]),/Singular/);
});
test('tracked surface anchors match the actual rendered triangle and inherit its tangent',()=>{
  const r=rig(), c=clip(), parent=r.parts[0], child=r.parts[1];
  parent.mesh={rows:2,columns:2,axis:'y'}; parent.pivot=[50,0]; child.surfaceAttachment=true;
  c.tracks=[{part:'root',property:'bend',keys:[{time:0,value:20}]},{part:'child',property:'y',keys:[{time:0,value:20}]}];
  const s=stateAt(r,c,.5), p=s.find(p=>p.id==='root'), q=s.find(p=>p.id==='child');
  // y=20 lies halfway along row 0..40. Row 40 displacement = 20*.5=10.
  pair(q.joint,point(p.matrix,[80+5,20]));
  pair(point(q.frame,[0,4]),point(p.matrix,[86,24]));
  const verts=vertices(parent,20), tri=triangles(parent)[0];
  const matrix=triangleMatrix(tri.map(i=>verts[i].source),tri.map(i=>verts[i].target));
  pair(deformPoint(parent,[30,20],20),point(matrix,[30,20]));
});
test('out-of-asset anchor displacement stays bounded and subdivision failures are explicit',()=>{
  const p={size:[100,80],pivot:[50,0],mesh:{axis:'y',rows:4,columns:2}};
  pair(deformPoint(p,[0,400],20),[20,400]);
  pair(deformPoint(p,[0,-400],20),[0,-400]);
  pair(deformationJacobian(p,[0,400],20),[1,0,0,1,0,0]);
  assert.throws(()=>vertices({...p,mesh:{rows:-1,columns:4}},20),/subdivisions/);
});
test('resize preserves asset-relative animated attachments and restores clip/contact units',()=>{
  const r=rig(), c=clip(); r.contacts=[{part:'root',point:[22,70]}]; r.parts[0].mesh={axis:'y'};
  c.tracks=[{part:'child',property:'x',keys:[{time:0,value:30},{time:1,value:45}]},{part:'root',property:'bend',keys:[{time:0,value:10}]}];
  const before=structuredClone({r,c});
  resizePart(r,'root',[200,40],c); pair(r.parts[0].pivot,[100,5]); pair(r.parts[1].position,[60,0]);
  assert.equal(c.tracks[0].keys[1].value,90); assert.equal(c.tracks[1].keys[0].value,20); pair(r.contacts[0].point,[44,35]);
  resizePart(r,'root',[100,80],c); assert.deepEqual({r,c},before);
  for(const size of [[],[100],[100,80,20],null]) assert.throws(()=>resizePart(r,'root',size),/Invalid/);
});
test('linear driver has zero acceleration and causes no fabricated boundary impulse',()=>{
  const c=clip(); c.tracks=[{part:'root',property:'rotation',keys:[{time:0,value:0},{time:2,value:90,ease:'linear'}]}];
  const config={driver:'root',property:'rotation',frequencyHz:2,damping:.6,gain:.2,maxDegrees:30};
  for(const t of [.01,.1,.7,1.4]) near(secondaryAngle(config,c,t,sample),0);
});
test('secondary RK4 matches independent damped-oscillator convolution and scrub order',()=>{
  const c=clip(); c.tracks=[{part:'root',property:'rotation',keys:[{time:0,value:0},{time:2,value:30}]}];
  const config={driver:'root',property:'rotation',frequencyHz:1.7,damping:.4,gain:.2,maxDegrees:30};
  const t=.7, n=10000, h=t/n, omega=2*Math.PI*config.frequencyHz, wd=omega*Math.sqrt(1-config.damping**2);
  let integral=0;
  for(let i=0;i<=n;i++) {
    const tau=i*h, u=tau/2, force=-config.gain*30*60*u*(2*u*u-3*u+1)/4;
    const impulse=Math.exp(-config.damping*omega*(t-tau))*Math.sin(wd*(t-tau))/wd;
    integral+=(i===0||i===n?1:i%2?4:2)*force*impulse;
  }
  const expected=integral*h/3;
  near(secondaryAngle(config,c,t,sample),expected,1e-7);
  const first=secondaryAngle(config,c,t,sample); secondaryAngle(config,c,1.2,sample); assert.equal(secondaryAngle(config,c,t,sample),first);
});
test('invalid hierarchy, rest transforms, duplicate tracks and unsafe meshes fail explicitly',()=>{
  const r=rig(), c=clip(); r.parts[0].scaleX=NaN; r.parts[0].mesh={rows:0,columns:4};
  assert.ok(validateRig(r).some(e=>e.includes('scaleX'))); assert.ok(validateRig(r).some(e=>e.includes('mesh')));
  r.parts[0].parent='child'; assert.throws(()=>stateAt(r,c,0),/cycle/);
  r.parts[0].parent='missing'; assert.throws(()=>stateAt(r,c,0),/Missing/);
  const track={part:'child',property:'rotation',keys:[{time:0,value:0}]}; c.tracks=[track,structuredClone(track)];
  assert.ok(validateClip(r,c).some(e=>e.includes('Duplicate track')));
  assert.throws(()=>stateAt(r,c,NaN),/Finite sample/);
});
test('mesh seam guards preserve translucent texture alpha without dark overlap bands',async()=>{
  const {createCanvas}=await import('@napi-rs/canvas'),{drawMesh}=await import('../core/mesh.mjs');
  const source=createCanvas(100,100),s=source.getContext('2d');
  s.fillStyle='rgba(255,120,0,.5)'; s.fillRect(0,0,100,100);
  const sourceAlpha=s.getImageData(50,50,1,1).data[3];
  const target=createCanvas(140,140),ctx=target.getContext('2d');ctx.translate(10,10);
  drawMesh(ctx,source,{size:[100,100],pivot:[50,0],mesh:{rows:6,columns:5,axis:'y'}},12,createCanvas);
  const data=ctx.getImageData(35,20,60,70).data;
  for(let i=3;i<data.length;i+=4) assert.equal(data[i],sourceAlpha);
});
test('resize migrates per-motion contact image coordinates and restores them',()=>{
 const rig={parts:[{id:'foot',size:[20,10],pivot:[10,5]}]},clip={tracks:[],contacts:[{part:'foot',point:[10,9],target:[100,200]}]};
 resizePart(rig,'foot',[40,30],[clip]);assert.deepEqual(clip.contacts[0].point,[20,27]);assert.deepEqual(clip.contacts[0].target,[100,200]);
 resizePart(rig,'foot',[20,10],[clip]);assert.deepEqual(clip.contacts[0].point,[10,9]);
});
