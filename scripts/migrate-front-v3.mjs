import fs from 'node:fs';
import {project,put} from '../server/store.mjs';
import {checkedSave} from '../server/service.mjs';
import {resizePart} from '../core/edit.mjs';
import {readSkeleton,saveSkeleton} from '../server/skeleton.mjs';
import {buildSkeleton} from '../core/skeleton.mjs';
const p=structuredClone(project('fox'));
if(p.rig.motionProfile==='fox-front-v3'){console.log('Front v3 already installed');process.exit(0);}
const archive=`fox-v2-${p.revision}`;put('motion-archive',archive,p);
fs.writeFileSync('public/animations/fox/source/regenerated-v3/previous-project.json',JSON.stringify(p,null,2));
const m=JSON.parse(fs.readFileSync('public/animations/fox/source/regenerated-v3/registration.json'));
for(const side of ['left','right']){const part=p.rig.parts.find(x=>x.id===`shoe_${side}`);part.asset=`/animations/fox/parts/foot_${side}_v3.png`;part.size=m.size;part.pivot=m[side==='left'?'leftPivot':'rightPivot'];part.name=`${side==='left'?'Left':'Right'} foot`;part.anatomy={includes:['ankle','shoe'],mirrorOf:side==='right'?'shoe_left':null};for(const c of p.rig.contacts??[])if(c.part===part.id)c.point=m[side==='left'?'contactLeft':'contactRight'];}
const mouth=p.rig.parts.find(x=>x.id==='mouth');resizePart(p.rig,'mouth',mouth.size.map(n=>n*.7),[]);mouth.position=[-1,-11];
p.rig.motionProfile='fox-front-v3';p.rig.allowedActions=['ready'];p.rig.motionTemplates={ready:{name:'Ready',duration:2.4,loop:true,fps:24,tracks:[]}};
p.rig.semanticReview={version:1,camera:'front',notes:['Old presets archived: concerned mouth was mislabeled thinking.','Complete foot mirrored as one ankle and shoe assembly.','Mouth centered below nose; smaller visible ink.'],emotion:'friendly neutral; no cognitive-state claim'};
p.rig.assets=[...new Set([...p.rig.assets,...p.rig.parts.map(x=>x.asset)])];
p.clips=[{id:'ready-a',...p.rig.motionTemplates.ready}];p.selected='ready-a';
const saved=checkedSave('fox',p,p.revision);fs.writeFileSync('public/animations/fox/rig.json',JSON.stringify(saved.rig,null,2));const old=readSkeleton('fox');saveSkeleton('fox',buildSkeleton(saved.rig),old.revision);console.log('Archived',archive,'saved revision',saved.revision);
