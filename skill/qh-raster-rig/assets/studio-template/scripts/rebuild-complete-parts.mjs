import {createCanvas,loadImage} from '@napi-rs/canvas';
import fs from 'node:fs/promises';
import{createHash}from'node:crypto';
import {project} from '../server/store.mjs';
import {readSkeleton,saveSkeleton} from '../server/skeleton.mjs';
import {checkedSave} from '../server/service.mjs';
import {padPartCoordinates} from '../core/edit.mjs';
import {sourceMargins} from '../core/source-integrity.mjs';
const p=project('fox'),padding=8,quality=4;
if(p.rig.parts.some(v=>v.sourcePolicy))throw Error('Already migrated; restore saved pre-rebuild project to replay');
await fs.writeFile('public/animations/fox/source/regenerated-v2/project-before.json',JSON.stringify(p,null,2));
const replacements={tail:'tail-full.png',pelvis:'hips-flat.png',leg_left:'leg-full.png',leg_right:'leg-full.png'},report=[];
for(const part of p.rig.parts){
 const oldSize=[...part.size],assets=new Set([part.asset,...p.clips.flatMap(c=>c.tracks.filter(t=>t.part===part.id&&t.property==='asset').flatMap(t=>t.keys.map(k=>k.value)))]),mapping={};
 for(const [i,asset]of [...assets].entries()){
  const replacement=part.id==='hand_right'&&asset==='/animations/fox/parts/hand_wave_registered.png'?'wrist-full.png':asset===part.asset?replacements[part.id]:null;
  const file=replacement?'public/animations/fox/source/regenerated-v2/'+replacement:'public'+asset;
  const img=await loadImage(file),sc=createCanvas(img.width,img.height),sx=sc.getContext('2d');sx.drawImage(img,0,0);
  const source=sourceMargins(sx.getImageData(0,0,img.width,img.height).data,img.width,img.height);
  const c=createCanvas(Math.ceil((oldSize[0]+2*padding)*quality),Math.ceil((oldSize[1]+2*padding)*quality)),ctx=c.getContext('2d');ctx.scale(quality,quality);ctx.translate(padding,padding);
  if(replacement){const [x,y,w,h]=source.bounds;
   if(part.id==='tail') {const scale=Math.min(oldSize[0]/w,oldSize[1]/h)*.93;ctx.drawImage(img,x,y,w,h,part.pivot[0]-.90*w*scale,part.pivot[1]-.60*h*scale,w*scale,h*scale);}
   else if(part.id==='hand_right')ctx.drawImage(img,x,y,w,h,0,-5,oldSize[0],49);
   else ctx.drawImage(img,x,y,w,h,0,0,oldSize[0],part.id==='pelvis'?40:oldSize[1]);
  }else ctx.drawImage(img,0,0,...oldSize);
  const buffer=c.toBuffer('image/png'),hash=createHash('sha256').update(buffer).digest('hex').slice(0,12);
  const url=`/animations/fox/parts/${part.id}_complete_v2_${i}-${hash}.png`;
  await fs.writeFile('public'+url,buffer);mapping[asset]=url;
  const result=sourceMargins(ctx.getImageData(0,0,c.width,c.height).data,c.width,c.height);report.push({part:part.id,original:asset,replacement:file,result});
  if(result.empty||result.margins.some(v=>v<8))throw Error(`Insufficient margin: ${part.id}`);
 }
 part.asset=mapping[part.asset];
 if(part.id==="hand_right")part.replacementAssets={wave:mapping["/animations/fox/parts/hand_wave_registered.png"]};
 if(part.id==="mouth")part.replacementAssets={concerned:mapping["/animations/fox/parts/mouth_concerned.png"],happy:mapping["/animations/fox/parts/mouth_happy.png"]};
 for(const clip of p.clips)for(const t of clip.tracks)if(t.part===part.id&&t.property==='asset')for(const k of t.keys)k.value=mapping[k.value];
 p.rig.assets.push(...Object.values(mapping));padPartCoordinates(p.rig,part.id,padding,p.clips);part.sourcePolicy={minMarginPx:8};
 if(part.id==='pelvis')part.z=1.5;
 if(part.id==='hand_right')part.z=7.5;
}
await fs.writeFile('public/animations/fox/rig.json',JSON.stringify(p.rig,null,2)+'\n');
await fs.writeFile('docs/complete-parts-audit.json',JSON.stringify(report,null,2));
checkedSave('fox',p,p.revision);
const saved=readSkeleton('fox');for(const n of saved.skeleton.nodes){n.pivot=n.pivot.map(v=>v+padding);if(n.contact)n.contact.point=n.contact.point.map(v=>v+padding);for(const c of n.contacts??[])if(c.point)c.point=c.point.map(v=>v+padding);}
saveSkeleton('fox',saved.skeleton,saved.revision);await fs.writeFile('public/animations/fox/skeleton.json',JSON.stringify(saved.skeleton,null,2)+'\n');
console.log('Registered complete parts and safe margins without changing world joints');
