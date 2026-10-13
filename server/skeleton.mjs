import {createHash} from 'node:crypto';
import {get,put,project,withRecordLock} from './store.mjs';
import {buildSkeleton,validateSkeleton,inspectSkeleton} from '../core/skeleton.mjs';
const fingerprint=rig=>createHash('sha256').update(JSON.stringify(rig)).digest('hex');
export function readSkeleton(character) {
 const p=project(character), saved=get('skeleton',character);
 return saved || put('skeleton',character,{revision:0,rigFingerprint:fingerprint(p.rig),skeleton:buildSkeleton(p.rig),history:[]});
}
export function saveSkeleton(character,skeleton,revision) {
 return withRecordLock("skeleton",character,()=>{
 const p=project(character),old=readSkeleton(character);
 if(old.revision!==revision) {const e=Error('Skeleton revision changed; reload first');e.status=409;throw e;}
 validateSkeleton(skeleton,p.rig);
 const next={revision:revision+1,rigFingerprint:fingerprint(p.rig),skeleton,
 history:[...old.history,{revision:old.revision,skeleton:old.skeleton,time:new Date().toISOString()}]};
 return put('skeleton',character,next);
 });
}
export function checkSkeleton(character,clipId) {
 const p=project(character), saved=readSkeleton(character),clip=p.clips.find(c=>c.id===clipId);
 if(!clip) throw Error('Motion not found');
 const result=inspectSkeleton(p.rig,clip,saved.skeleton);
 const report={...result,character,clip:clipId,skeletonRevision:saved.revision,rigChanged:saved.rigFingerprint!==fingerprint(p.rig),checkedAt:new Date().toISOString()};
 put('skeleton-check',character,report);return report;
}
