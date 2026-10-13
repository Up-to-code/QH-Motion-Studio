import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {assess,repair} from '../server/render.mjs';
import {PUBLIC} from '../server/paths.mjs';
const folder=path.join(PUBLIC,'animations','generic-test-fixture');
await fs.mkdir(folder,{recursive:true});
const asset='/animations/generic-test-fixture/block.png';
const padded='/animations/generic-test-fixture/padded.png';
for(const [name,rect] of [['block',[0,0,16,16]],['padded',[6,6,4,4]]]){
  const c=createCanvas(16,16),ctx=c.getContext('2d');ctx.fillStyle='#f80';ctx.fillRect(...rect);
  await fs.writeFile(path.join(folder,`${name}.png`),c.toBuffer('image/png'));
}
const body=(id,parent,position,extra={})=>({id,parent,position,pivot:[8,8],size:[16,16],z:0,asset,...extra});
const make=()=>({version:1,id:'generic-test',canvas:[128,64],origin:[64,32],ground:60,assets:[asset,padded],parts:[body('alpha',null,[0,0]),body('beta','alpha',[8,0],{attachment:{required:true,radiusPx:3,minOverlap:1}})]});
const clip=()=>({id:'probe',name:'Probe',duration:.1,fps:24,tracks:[]});
test('required attachment validates pair overlap for arbitrary names; child coverage alone cannot pass',async()=>{
  const r=make(),c=clip();
  assert.equal((await assess(r,c)).metrics.jointGapSamples,0);
  r.parts[1].position=[30,0];const q=await assess(r,c);
  assert.ok(q.metrics.jointGapSamples>0);assert.equal(q.accepted,false);
});
test('intentional detached decoration has no required-attachment error',async()=>{
  const r=make();r.parts[1].position=[30,0];r.parts[1].attachment={required:false};r.connectivity={required:false};
  const q=await assess(r,clip());assert.equal(q.metrics.jointGapSamples,0);assert.equal(q.accepted,true);
});
test('padded alpha catches partial clipping and ignores transparent source padding',async()=>{
  const r=make();r.parts=[body('alpha',null,[-61,0],{asset:padded})];
  const q=await assess(r,clip()); // world origin3; painted support1..5 is entirely on-screen, image bounds -5..11.
  assert.equal(q.metrics.outsideAlphaPixels,0);assert.equal(q.accepted,true);
  r.parts[0].asset=asset;const clipped=await assess(r,clip());
  assert.ok(clipped.metrics.outsideAlphaPixels>0);assert.equal(clipped.accepted,false);
});
test('active contact intervals permit free movement outside the planted interval',async()=>{
  const r=make(),c=clip();r.parts=[r.parts[0]];r.contacts=[{part:'alpha',point:[8,8],activeIntervals:[[0,.025]]}];
  c.tracks=[{part:'alpha',property:'x',keys:[{time:0,value:0},{time:.025,value:0,ease:'linear'},{time:.05,value:2,ease:'linear'},{time:.1,value:0,ease:'linear'}]}];
  assert.equal((await assess(r,c)).metrics.contactDriftPx,0);
  delete r.contacts[0].activeIntervals;
  assert.ok((await assess(r,c)).metrics.contactDriftPx>.5);
});
test('contact tolerance and explicit target use world pixels without universal .5 rule',async()=>{
  const r=make();r.parts=[r.parts[0]];r.contacts=[{part:'alpha',point:[8,8],target:[63,32],tolerancePx:1.1}];
  const q=await assess(r,clip());assert.equal(q.metrics.contactDriftPx,1);assert.equal(q.metrics.contactViolationPx,0);assert.equal(q.accepted,true);
});
test('lock-local repair follows declared contact rather than naming shoes/legs',async()=>{
  const r=make(),c=clip();r.parts=[r.parts[0]];r.contacts=[{part:'alpha',point:[8,8],repair:'lock-local'}];
  c.tracks=[{part:'alpha',property:'x',keys:[{time:0,value:0},{time:.05,value:2},{time:.1,value:0}]}];
  const result=await repair(r,c,95,1);assert.equal(result.status,'accepted');assert.ok(result.clip.tracks[0].keys.every(k=>k.value===0));
  delete r.contacts[0].repair;const untouched=await repair(r,c,95,1);assert.equal(untouched.status,'needs-art-review');assert.equal(untouched.clip.tracks[0].keys[1].value,2);
});
test('malformed declarations fail closed and extreme padded extents are inconclusive',async()=>{
  const r=make();r.parts[1].attachment.radiusPx=NaN;assert.equal((await assess(r,clip())).score,0);
  delete r.parts[1].attachment;r.parts[1].position=[1e8,0];const q=await assess(r,clip());
  assert.ok(q.metrics.clippingInconclusiveSamples>0);assert.equal(q.accepted,false);
});
test.after(async()=>fs.rm(folder,{recursive:true,force:true}));
test('motions can override rig contacts without locking unrelated actions',async()=>{
 const r=make();r.contacts=[{part:'alpha',point:[8,8]}];
 const c=clip();c.tracks=[{part:'alpha',property:'x',keys:[{time:0,value:0},{time:c.duration,value:5}]}];
 assert((await assess(r,c)).metrics.contactViolationPx>0);
 c.contacts=[];c.loop=false;assert.equal((await assess(r,c)).metrics.contactViolationPx,0);
});
test('contact dots follow rendered mesh material instead of the undeformed bone frame',async()=>{
 const r=make(),c=clip();r.parts[0].mesh={columns:2,rows:2,axis:'y'};r.contacts=[{part:'alpha',point:[8,16]}];
 c.tracks=[{part:'alpha',property:'bend',keys:[{time:0,value:0},{time:.05,value:8},{time:.1,value:0}]}];
 const q=await assess(r,c);assert(Math.abs(q.metrics.contactDriftPx-8)<1e-8);assert.equal(q.accepted,false);
 const {buildSkeleton,skeletonPose}=await import('../core/skeleton.mjs');const s=buildSkeleton(r),node=skeletonPose(r,c,.05,s).find(n=>n.id.startsWith('contact-'));
 assert.deepEqual(node.position,[72,40]);assert.equal(s.nodes.find(n=>n.id===node.id).lengthPolicy,'surface');
});
