import {randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs';
import {assetPath,ROOT} from './paths.mjs';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {get,put,project,withRecordLock} from './store.mjs';
import {readSkeleton,checkSkeleton} from './skeleton.mjs';
import {inspectSkeleton} from '../core/skeleton.mjs';
import {loadAssets,assess,repair} from './render.mjs';
import {drawRig,stateAt,validateClip,validateRig} from '../core/engine.mjs';
import {regions,overlapCount,pixelDifference} from '../core/regions.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const engineFingerprint=createHash('sha256').update(['core/engine.mjs','core/mesh.mjs','core/secondary.mjs','core/analysis.mjs','core/regions.mjs','core/source-integrity.mjs','core/skeleton.mjs','server/render.mjs','server/workflow.mjs'].map(file=>fs.readFileSync(path.join(ROOT,file),'utf8')).join('\n')).digest('hex');
const motionHash=({rig,clip})=>hash({rig,clip,engineFingerprint,assetHashes:rig.assets.map(a=>[a,createHash('sha256').update(fs.readFileSync(assetPath(a))).digest('hex')])});
export function readContext(character) {
 const p=project(character);
 return get('context',character)||put('context',character,{revision:0,character,
 identity:{name:p.rig.name,reference:null},appearance:'',plan:'',motionIntent:'',
 decisions:[],failures:[],results:[],skeletonRevision:readSkeleton(character).revision,updatedAt:new Date().toISOString()});
}
export function saveContext(character,value,revision) {
 return withRecordLock("context",character,()=>{
 const old=readContext(character);
 if(revision!==old.revision){const e=Error('Context revision changed');e.status=409;throw e;}
 if(!value || typeof value!=='object' || Array.isArray(value)) throw Error('Context object required');
 const next={...old,...value,character,revision:revision+1,updatedAt:new Date().toISOString()};
 for(const key of ['decisions','failures','results']){if(!Array.isArray(next[key]))throw Error('Context history fields must be arrays');next[key]=next[key].slice(-100);}
 next.historyPolicy={recentEntries:100,fullEvidence:'workflow and context-history records'};
 if(JSON.stringify(next).length>200000)throw Error('Context must fit 200KB; retain detailed evidence in workflow records');
 put('context-history',`${character}-${old.revision}`,old);return put('context',character,next);
 });
}
function rgba(rig,clip,time,images,only=null) {
 const c=createCanvas(...rig.canvas);drawRig(c.getContext('2d'),rig,clip,time,images,{createCanvas,
 hidden:only?rig.parts.filter(p=>p.id!==only).map(p=>p.id):[]});
 return c.getContext('2d').getImageData(0,0,...rig.canvas).data;
}
export async function inspectRegions(rig,clip,{tileSize=32,halo=4,samples=12}={}) {
 if(!Number.isInteger(samples)||samples<2||samples>120||![8,16,32,64].includes(tileSize)||!Number.isInteger(halo)||halo<0||halo>32)throw Error('Invalid regional inspection settings');
 const errors=[...validateRig(rig),...validateClip(rig,clip)];if(errors.length)throw Error(errors.join('; '));
 const images=await loadAssets(rig),[w,h]=rig.canvas,tiles=regions(w,h,tileSize,halo).map(t=>({...t,occupied:0})),findings=[];
 const times=[...new Set([...Array.from({length:samples},(_,f)=>clip.duration*f/(samples-1)),...clip.tracks.flatMap(t=>t.keys.map(k=>k.time)),...rig.parts.flatMap(p=>(p.attachment?.activeIntervals || []).flat())])].sort((a,b)=>a-b);
 for(let f=0;f<times.length;f++) {
  const time=times[f],states=stateAt(rig,clip,time),masks=new Map();
  const full=rgba(rig,clip,time,images);
  for(const tile of tiles) {const[x,y,tw,th]=tile.core;let count=0;for(let j=y;j<y+th;j++)for(let i=x;i<x+tw;i++)if(full[(j*w+i)*4+3]>80)count++;tile.occupied=Math.max(tile.occupied,count);}
  const mask=id=>{if(!masks.has(id))masks.set(id,rgba(rig,clip,time,images,id));return masks.get(id);};
  // Only declared physical attachment requirements can distinguish intended detached decorations from gaps.
  for(const p of states.filter(p=>p.visible && p.parent && p.attachment?.required && (!p.attachment.activeIntervals || p.attachment.activeIntervals.some(([a,b])=>time>=a&&time<=b)))) {
   const radius=p.attachment.radiusPx ?? p.attachment.radius ?? 8;
   if(!Number.isFinite(radius)||radius<1||radius>128)throw Error('Attachment radius must be 1..128');
   const bounds=[p.joint[0]-radius,p.joint[1]-radius,radius*2,radius*2];
   const count=overlapCount(mask(p.id),mask(p.parent),bounds,w,h,p.attachment.alphaThreshold ?? 80);
   if(count<(p.attachment.minOverlap ?? 1))findings.push({category:'attachment-overlap',severity:'error',part:p.id,parent:p.parent,time,frame:f,bounds,error:1,overlapPixels:count,
    evidence:'Rendered parent/child alpha overlap near the authored joint is below the declared minimum.'});
  }
 }
 const start=rgba(rig,clip,0,images),end=rgba(rig,clip,clip.duration,images);
 const loopTiles=pixelDifference(start,end,w,h,tileSize,halo);
 if(clip.loop===true)for(const tile of loopTiles.filter(t=>t.max>8))findings.push({category:'loop-pixels',severity:'error',time:clip.duration,bounds:tile.bounds,error:tile.mean,changed:tile.changed});
 tiles.sort((a,b)=>b.occupied-a.occupied);
 return {tiles,findings,loopTiles:loopTiles.filter(t=>t.changed),scope:'Rendered alpha overlap for declared attachments; tile-level loop RGBA differences. Semantic artwork review remains separate.'};
}
function technicalFindings(report) {
 return [...Object.entries(report.penalties || {}).filter(([,n])=>n>0).map(([key,n])=>({category:`technical-${key}`,severity:'error',error:n,evidence:report.metrics})),...(report.sourceFindings??[]).map(f=>({category:'source-crop-risk',severity:'error',part:f.part,asset:f.asset,error:1,evidence:f,scope:'source-image'}))];
}
export async function beginWorkflow(character,clipId,settings={}) {
 const p=project(character),clip=p.clips.find(c=>c.id===clipId);if(!clip)throw Error('Motion not found');
 const context=readContext(character), skeleton=checkSkeleton(character,clipId);
 const regional=await inspectRegions(p.rig,clip,settings),technical=await assess(p.rig,clip);
 const id=randomUUID(), findings=[...skeleton.findings.map(f=>({...f,severity:'error'})),...regional.findings,...technicalFindings(technical)];
 const tasks=[{role:'skeleton',status:skeleton.passed?'passed':'findings',findings:skeleton.findings},
 {role:'regional-attachment',status:regional.findings.length?'findings':'passed',findings:regional.findings},
 {role:'technical',status:technical.accepted?'passed':'findings',report:technical},
 {role:'artwork-review',status:'pending',instruction:'Inspect joint neighborhoods, sleeve ownership, hidden clean plates, identity and acting. Numeric checks cannot certify these.'}];
 const workflow={id,character,clip:clipId,inputRevision:p.revision,inputHash:motionHash({rig:p.rig,clip}),contextRevision:context.revision,
 skeletonRevision:readSkeleton(character).revision,status:'review-required',settings,findings,tasks,iterations:[],regional,technical,createdAt:new Date().toISOString()};
 put('workflow',id,workflow);
 withRecordLock('context',character,()=>{const current=readContext(character);saveContext(character,{results:[...current.results,{workflow:id,clip:clipId,findings:findings.length,technicalAccepted:technical.accepted}],failures:[...current.failures,...findings]},current.revision);});
 return workflow;
}
export function readWorkflow(id) {const w=get('workflow',id);if(!w)throw Error('Workflow not found');return w;}
export async function regionalPacket(id,tileId,timeOverride) {
 const w=readWorkflow(id),p=project(w.character),tile=w.regional.tiles.find(t=>t.id===tileId);if(!tile)throw Error('Tile not found');
 if(motionHash({rig:p.rig,clip:p.clips.find(c=>c.id===w.clip)})!==w.inputHash)throw Error('Project changed; run a new inspection');
 const clip=p.clips.find(c=>c.id===w.clip),images=await loadAssets(p.rig);
 const related=w.findings.filter(f=>f.bounds && f.bounds[0]<tile.bounds[0]+tile.bounds[2] && f.bounds[0]+f.bounds[2]>tile.bounds[0] && f.bounds[1]<tile.bounds[1]+tile.bounds[3] && f.bounds[1]+f.bounds[3]>tile.bounds[1]);
 const time=timeOverride ?? related[0]?.time ?? 0;
 if(!Number.isFinite(time)||time<0||time>clip.duration)throw Error("Region time must lie inside the motion");
 const full=createCanvas(...p.rig.canvas);
 drawRig(full.getContext('2d'),p.rig,clip,time,images,{createCanvas});
 const crop=createCanvas(tile.bounds[2],tile.bounds[3]);
 crop.getContext('2d').drawImage(full,...tile.bounds,0,0,tile.bounds[2],tile.bounds[3]);
 return {workflow:id,tile,time,image:'data:image/png;base64,'+crop.toBuffer('image/png').toString('base64'),character:w.character,clip:w.clip,context:readContext(w.character),skeleton:readSkeleton(w.character),
 findings:w.findings.filter(f=>!f.bounds || f.bounds[0]<tile.bounds[0]+tile.bounds[2] && f.bounds[0]+f.bounds[2]>tile.bounds[0] && f.bounds[1]<tile.bounds[1]+tile.bounds[3] && f.bounds[1]+f.bounds[3]>tile.bounds[1]),
 instruction:'Inspect core plus halo. Preserve original raster resolution and ownership. Record evidence before proposing a patch; do not erase pixels merely to reduce error.'};
}

function detailVector(findings) {
 const v={};for(const f of findings){const key=[f.category,f.part || f.node || 'scene',Number(f.time || 0).toFixed(6),JSON.stringify(f.bounds || [])].join(':');v[key]=(v[key]||0)+(Number.isFinite(f.error)?Math.abs(f.error):1);}return v;
}
function vector(findings) {
 const v={};for(const f of findings)v[f.category]=(v[f.category]||0)+(Number.isFinite(f.error)?Math.abs(f.error):1);return v;
}
/** Test a proposed numeric candidate without overwriting the accepted project. */
export async function evaluatePatch(id,candidate,{targetCategory,note=''}={}) {
 const w=readWorkflow(id),p=project(w.character),source=p.clips.find(c=>c.id===w.clip);
 if(motionHash({rig:p.rig,clip:source})!==w.inputHash)throw Error('Project changed; inspect again before patching');
 if(!targetCategory || !w.findings.some(f=>f.category===targetCategory))throw Error('Choose an observed error category');
 if(w.findings.some(f=>f.category===targetCategory&&f.provenance==='agent-review'))throw Error('This category requires a fresh specialist review of the proposed candidate');
 if(!candidate?.rig || !candidate?.clip || candidate.rig.id!==w.character)throw Error('Candidate rig and clip required');
 const errors=[...validateRig(candidate.rig),...validateClip(candidate.rig,candidate.clip)];if(errors.length)throw Error(errors.join('; '));
 const regional=await inspectRegions(candidate.rig,candidate.clip,w.settings);
 const skeleton=inspectSkeleton(candidate.rig,candidate.clip,readSkeleton(w.character).skeleton);
 const technical=await assess(candidate.rig,candidate.clip);
 const findings=[...skeleton.findings,...regional.findings,...technicalFindings(technical)],before=vector(w.findings),after=vector(findings);
 const beforeDetail=detailVector(w.findings),afterDetail=detailVector(findings);
 const regressions=Object.entries(afterDetail).filter(([key,n])=>n>(beforeDetail[key]||0)+1e-6).map(([key])=>key);
 const improved=(after[targetCategory]||0)<(before[targetCategory]||0)-1e-6;
 const accepted=improved && regressions.length===0 && technical.score>=w.technical.score && (!w.technical.accepted || technical.accepted);
 const iteration={id:randomUUID(),createdAt:new Date().toISOString(),note,targetCategory,accepted,improved,regressions,before,after,technical,findings,
 candidateHash:hash(candidate),scope:'Numeric improvement only; artwork and acting review still required.'};
 put('candidate',iteration.id,{...candidate,workflow:id});
 withRecordLock('workflow',id,()=>{
  const current=readWorkflow(id),latest=project(w.character);
  if(motionHash({rig:latest.rig,clip:latest.clips.find(c=>c.id===w.clip)})!==w.inputHash)throw Error('Project changed during evaluation; reinspect');
  current.iterations.push(iteration);current.bestCandidate=accepted?iteration.id:current.bestCandidate;
  current.status=accepted?'candidate-review-required':'patch-rejected';put('workflow',id,current);
  const context=readContext(w.character);saveContext(w.character,{decisions:[...context.decisions,{workflow:id,iteration:iteration.id,accepted,note}],results:[...context.results,{iteration:iteration.id,before,after}]},context.revision);
 });
 return iteration;
}
export function recordReview(id,{role,note,passed,regions:reviewedRegions=[]}) {
 return withRecordLock('workflow',id,()=>{
 const w=readWorkflow(id),p=project(w.character),task=w.tasks.find(t=>t.role===role);
 if(motionHash({rig:p.rig,clip:p.clips.find(c=>c.id===w.clip)})!==w.inputHash)throw Error('Project or artwork changed; inspect again');
 if(!task || typeof note!=='string' || !note.trim() || typeof passed!=='boolean')throw Error('Known inspector role, evidence note and boolean result required');
 if(reviewedRegions.some(id=>!w.regional.tiles.some(t=>t.id===id)))throw Error('Unknown reviewed region');
 task.review={note,passed,regions:reviewedRegions,time:new Date().toISOString()};
 task.status=passed?'reviewed':'findings';
 // Human/agent review evidence is retained; technical passing never automatically confirms artwork.
 put('workflow',id,w);return w;
 });
}

export async function repairWorkflow(id,maxAttempts=3) {
 if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>3)throw Error("Use 1..3 bounded attempts per batch");
 const w=readWorkflow(id),p=project(w.character),clip=p.clips.find(c=>c.id===w.clip);
 if(motionHash({rig:p.rig,clip})!==w.inputHash)throw Error("Project changed; inspect again");
 const target=w.findings.find(f=>['technical-limits','technical-contact','technical-speed'].includes(f.category));
 if(!target){w.status='specialist-review-required';w.stopReason='No declared numeric repair applies; inspect artwork/anchors using saved regions.';put('workflow',id,w);return w;}
 const fixed=await repair(p.rig,clip,95,maxAttempts);
 const result=await evaluatePatch(id,{rig:p.rig,clip:fixed.clip},{targetCategory:target.category,note:'Bounded declared-constraint repair; previous project preserved'});
 const next=readWorkflow(id);next.repairHistory=fixed.history;next.stopReason=result.accepted?'Candidate improved; inspect acting/artwork before publishing.':'No safe improvement; specialist review required.';put('workflow',id,next);return next;
}
export function readCandidate(id){const c=get('candidate',id);if(!c)throw Error('Candidate not found');return c;}

/** External agent work queue: one occupied region/role at a time, persisted on disk. */
export function claimRegion(id,agent,role='artwork-review') {
 return withRecordLock('workflow',id,()=>{
 if(typeof agent!=='string'||!agent.trim()||agent.length>100||!['artwork-review','ownership-review','motion-review'].includes(role))throw Error('Agent identity and known specialist role required');
 const w=readWorkflow(id),p=project(w.character);
 if(motionHash({rig:p.rig,clip:p.clips.find(c=>c.id===w.clip)})!==w.inputHash)throw Error('Project changed; inspect again');
 w.assignments ||= [];
 const existing=w.assignments.find(a=>a.agent===agent&&a.role===role&&a.status==='claimed');if(existing)return existing;
 const tile=w.regional.tiles.find(t=>t.occupied>0&&!w.assignments.some(a=>a.tile===t.id&&a.role===role));
 if(!tile)return {status:'no-unassigned-regions',workflow:id,role};
 const task={id:randomUUID(),workflow:id,tile:tile.id,agent,role,status:'claimed',inputHash:w.inputHash,claimedAt:new Date().toISOString()};
 w.assignments.push(task);put('workflow',id,w);return task;
 });
}
export function submitRegion(id,taskId,agent,{note,passed,findings=[]}) {
 return withRecordLock('workflow',id,()=>{
 const w=readWorkflow(id),task=w.assignments?.find(t=>t.id===taskId);
 if(!task || task.agent!==agent || task.status!=='claimed')throw Error('Task must be claimed by this agent');
 if(typeof note!=='string'||!note.trim()||typeof passed!=='boolean'||!Array.isArray(findings)||findings.length>100)throw Error('Evidence note, result and bounded findings required');
 const p=project(w.character);if(motionHash({rig:p.rig,clip:p.clips.find(c=>c.id===w.clip)})!==task.inputHash)throw Error('Project changed; inspection task is stale');
 for(const f of findings)if(typeof f.category!=='string'||f.category.length>80||!Number.isFinite(f.error)||f.error<0)throw Error('Finding category and finite error required');
 task.status='reviewed';task.review={note,passed,findings,reviewedAt:new Date().toISOString()};
 w.findings.push(...findings.map(f=>({...f,provenance:'agent-review',agent,role:task.role,tile:task.tile})));
 put('workflow',id,w);
 const c=readContext(w.character);saveContext(w.character,{decisions:[...c.decisions,{workflow:id,task:taskId,agent,note,passed}],failures:[...c.failures,...findings]},c.revision);
 return task;
 });
}
