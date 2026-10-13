import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSkeleton,validateSkeleton,inspectSkeleton} from '../core/skeleton.mjs';
const rig={id:'unusual',canvas:[800,300],origin:[100,100],parts:[
{id:'base',position:[0,0],pivot:[10,10],size:[20,20],z:0},
{id:'tip',parent:'base',position:[30,0],pivot:[0,0],size:[10,10],z:1},
]};
const clip={duration:1,tracks:[{part:'base',property:'rotation',keys:[{time:0,value:0},{time:1,value:90}]}]};
test('skeleton derives authored anchors independent of character names and viewport',()=>{
 const s=buildSkeleton(rig);assert.deepEqual(s.nodes.find(n=>n.id==='tip').rest,[130,100]);
 assert.equal(s.nodes.find(n=>n.id==='tip').restLength,30);
 assert.equal(inspectSkeleton(rig,clip,s).passed,true);
});
test('saved skeleton detects changed pivot and broken limb offset',()=>{
 const s=buildSkeleton(rig), broken=structuredClone(rig);broken.parts[1].position=[40,0];broken.parts[1].pivot=[2,0];
 const result=inspectSkeleton(broken,clip,s);assert(result.findings.some(f=>f.category==='rest-anchor-drift'));
 assert(result.findings.some(f=>f.category==='pivot-contract-drift'));
});
test('parent nonuniform scaling is not a false bone stretch',()=>{
 const s=buildSkeleton(rig);const c=structuredClone(clip);c.tracks.push({part:'base',property:'scaleX',keys:[{time:0,value:1},{time:1,value:2}]});
 assert.equal(inspectSkeleton(rig,c,s).passed,true);
});
test('child translation is detected across sampled motion',()=>{
 const s=buildSkeleton(rig);const c=structuredClone(clip);c.tracks.push({part:'tip',property:'x',keys:[{time:0,value:30},{time:1,value:45}]});
 assert(inspectSkeleton(rig,c,s).findings.some(f=>f.category==='bone-length-change'));
});
test('skeleton rejects cycles and invalid numeric anchors',()=>{
 const s=buildSkeleton(rig);s.nodes[0].parent='tip';assert.throws(()=>validateSkeleton(s,rig),/cycle/);
 s.nodes[0].parent=null;s.nodes[0].rest[0]=NaN;assert.throws(()=>validateSkeleton(s,rig),/Invalid/);
});
test('generic motion generator does not silently perform incomplete Fox gestures',async()=>{
 const {makeMotion}=await import('../core/motions.mjs');
 assert.throws(()=>makeMotion(rig,'hello'),/authored motion/);
 const idle=makeMotion(rig,'idle');assert.equal(idle.name,'Rest pose');assert.equal(idle.tracks.length,0);
 const custom={...rig,motionTemplates:{wave:{duration:1,tracks:[{part:'tip',property:'rotation',keys:[{time:0,value:0},{time:1,value:30}]}]}}};
 assert.equal(makeMotion(custom,'wave',60).tracks[0].part,'tip');
});
test('pose libraries do not claim unsupported gestures or assume a body ID',async()=>{
 const {makeMotion}=await import('../core/motions.mjs');
 const r={...rig,id:'nia',mode:'poses',assets:['a','b','c'],parts:[{...rig.parts[0],id:'whole-character'}]};
 assert.throws(()=>makeMotion(r,'hello'),/no hello action/);assert.equal(makeMotion(r,'thinking').tracks[0].part,'whole-character');
 const other={...r,id:'unknown-pose'};assert.throws(()=>makeMotion(other,'thinking'),/authored motion/);assert.equal(makeMotion(other,'idle').tracks.length,0);
});
