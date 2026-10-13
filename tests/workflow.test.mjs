import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'qh-context-test-'));process.env.QH_DATA_DIR=temp;
const {project,put}=await import('../server/store.mjs');
const {readSkeleton,saveSkeleton}=await import('../server/skeleton.mjs');
const {readContext,saveContext,beginWorkflow,readWorkflow,regionalPacket,evaluatePatch,recordReview}=await import('../server/workflow.mjs');
test('context and skeleton are persistent with optimistic revisions',()=>{
 const c=readContext('fox');saveContext('fox',{plan:'Keep shoulder fixed; hand waves',motionIntent:'friendly hello'},c.revision);
 assert.throws(()=>saveContext('fox',{plan:'stale'},c.revision),/revision/);
 const s=readSkeleton('fox');assert.equal(s.skeleton.status,'draft');assert(s.skeleton.nodes.some(n=>n.contacts.length));
 saveSkeleton('fox',s.skeleton,s.revision);assert.throws(()=>saveSkeleton('fox',s.skeleton,s.revision),/revision/);
 const child=spawnSync(process.execPath,['--input-type=module','-e',"const {get}=await import('./server/store.mjs');console.log(JSON.stringify(get('context','fox')));"],{cwd:process.cwd(),env:{...process.env,QH_DATA_DIR:temp},encoding:'utf8'});
 assert.equal(child.status,0);assert.equal(JSON.parse(child.stdout).plan,'Keep shoulder fixed; hand waves');
});
test('workflow saves independent inspector tasks and regional raster evidence',async()=>{
 const p=project('fox'),w=await beginWorkflow('fox',p.clips[0].id,{samples:2,tileSize:64,halo:4});
 assert.equal(readWorkflow(w.id).id,w.id);assert.equal(w.tasks.find(t=>t.role==='artwork-review').status,'pending');
 const packet=await regionalPacket(w.id,w.regional.tiles[0].id);assert(packet.image.startsWith('data:image/png;base64,'));assert(packet.skeleton.skeleton.nodes.length);
 const review=recordReview(w.id,{role:'artwork-review',passed:false,note:'Sleeve seam needs local inspection',regions:[packet.tile.id]});assert.equal(review.tasks.at(-1).status,'findings');
});
test('numeric patch requires a measured error and preserves source project',async()=>{
 const p=project('fox'),s=readSkeleton('fox');const broken=structuredClone(p);broken.rig.parts.find(p=>p.id==='hand_right').position[0]+=12;put('project','fox',broken);
 const w=await beginWorkflow('fox',broken.clips[0].id,{samples:2,tileSize:64,halo:4});assert(w.findings.some(f=>f.category==='rest-anchor-drift'));
 const result=await evaluatePatch(w.id,{rig:p.rig,clip:p.clips[0]},{targetCategory:'rest-anchor-drift',note:'Restore saved authored hand joint'});
 assert.equal(result.improved,true);assert.equal(project('fox').rig.parts.find(p=>p.id==='hand_right').position[0],broken.rig.parts.find(p=>p.id==='hand_right').position[0]);
 assert.throws(()=>recordReview(w.id,{role:'made-up',passed:true,note:'x'}),/Known/);
});
test('patch cannot hide a new local defect inside an improved category total',async()=>{
 const original=project('fox'),saved=readSkeleton('fox');
 // Restore all bind anchors from saved contract before creating the intentional failure.
 const p=structuredClone(original);const reference=(await fs.readFile('public/animations/fox/rig.json','utf8'));p.rig=JSON.parse(reference);
 p.rig.parts.find(p=>p.id==='hand_right').position[0]+=20;put('project','fox',p);
 const w=await beginWorkflow('fox',p.clips[0].id,{samples:2,tileSize:64,halo:4});
 const candidate={rig:JSON.parse(reference),clip:p.clips[0]};candidate.rig.parts.find(p=>p.id==='brow_left').position[0]+=1;
 const result=await evaluatePatch(w.id,candidate,{targetCategory:'rest-anchor-drift'});
 assert.equal(result.accepted,false);assert(result.regressions.some(k=>k.includes('brow_left')));
});
test('bounded repair records candidates and leaves the original motion unchanged',async()=>{
 const {repairWorkflow}=await import('../server/workflow.mjs');
 const p=project('fox');p.rig=JSON.parse(await fs.readFile('public/animations/fox/rig.json','utf8'));
 const c=p.clips[0];if(!c.tracks.some(t=>t.part==='hand_right'&&t.property==='rotation'))c.tracks.push({part:'hand_right',property:'rotation',keys:[]});const t=c.tracks.find(t=>t.part==='hand_right'&&t.property==='rotation');t.keys=[{time:0,value:0},{time:c.duration/2,value:80},{time:c.duration,value:0}];put('project','fox',p);
 const w=await beginWorkflow('fox',c.id,{samples:2,tileSize:64,halo:4});assert(w.findings.some(f=>f.category==='technical-limits'));
 const repaired=await repairWorkflow(w.id,1);assert.equal(repaired.iterations.length,1);assert(repaired.repairHistory.length<=2);
 assert.equal(project('fox').clips[0].tracks.find(t=>t.part==='hand_right'&&t.property==='rotation').keys[1].value,80);
});
test('specialist region claims are distinct and evidence ownership is enforced',async()=>{
 const {claimRegion,submitRegion}=await import('../server/workflow.mjs');
 const p=project('fox'),w=await beginWorkflow('fox',p.clips[0].id,{samples:2,tileSize:64,halo:4});
 const a=claimRegion(w.id,'inspector-a'),b=claimRegion(w.id,'inspector-b');assert.notEqual(a.tile,b.tile);assert.equal(claimRegion(w.id,'inspector-a').id,a.id);
 assert.throws(()=>submitRegion(w.id,a.id,'inspector-b',{note:'x',passed:true}),/claimed/);
 submitRegion(w.id,a.id,'inspector-a',{note:'Reviewed sleeve ownership in local crop',passed:false,findings:[{category:'sleeve-ownership',error:1}]});
 assert(readWorkflow(w.id).findings.some(f=>f.category==='sleeve-ownership'&&f.provenance==='agent-review'));
});
test('optional JSON storage supports nested context/workflow updates',()=>{
 const dir=path.join(temp,'json-mode');
 const child=spawnSync(process.execPath,['--input-type=module','-e',"const {project}=await import('./server/store.mjs');const {beginWorkflow,claimRegion,submitRegion}=await import('./server/workflow.mjs');const p=project('fox');const w=await beginWorkflow('fox',p.clips[0].id,{samples:2,tileSize:64,halo:4});const task=claimRegion(w.id,'agent');submitRegion(w.id,task.id,'agent',{note:'local review',passed:true});console.log('ok');"],{cwd:process.cwd(),env:{...process.env,QH_DATA_DIR:dir,QH_STORAGE:'json'},encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/ok/);
});
test('working context stays bounded while retaining inspection references',()=>{
 const c=readContext('fox'),results=Array.from({length:250},(_,i)=>({workflow:`reference-${i}`}));
 const next=saveContext('fox',{results},c.revision);assert.equal(next.results.length,100);assert.equal(next.results[0].workflow,'reference-150');assert.equal(next.results.at(-1).workflow,'reference-249');
});
