import{isDeepStrictEqual}from'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {loadImage} from '@napi-rs/canvas';
import {project,get,put,withRecordLock} from './store.mjs';
import {PUBLIC,LOCAL,safeId,assetPath} from './paths.mjs';
import {validateRig,validateClip,stateAt} from '../core/engine.mjs';
import {buildSkeleton,validateSkeleton} from '../core/skeleton.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const limit=32*1024*1024;
function refs(value,out=new Set(),key=''){
 if(key==='assets')return out;
 if(typeof value==='string'&&value.startsWith('/animations/'))out.add(value);
 else if(Array.isArray(value))for(const v of value)refs(v,out);
 else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value))refs(v,out,k);
 return out;
}
export function compileFrames(rig,clip){
 return Array.from({length:Math.round(clip.duration*clip.fps)},(_,index)=>({index,time:index/clip.fps,parts:stateAt(rig,clip,index/clip.fps).map(p=>({id:p.id,asset:p.asset,visible:p.visible,opacity:p.opacity||0,matrix:p.matrix.map(n=>Math.round(n*1e6)/1e6||0),bend:p.bend||0}))}));
}
export async function createBundle(character){
 const p=structuredClone(project(character));if(['fox','nia','orbit'].includes(p.rig.id))p.rig.motionProfile=p.rig.id;const used=new Set([...p.rig.assets,...refs({rig:p.rig,clips:p.clips})]);p.rig.assets=[...used];
 const errors=[...validateRig(p.rig),...p.clips.flatMap(c=>validateClip(p.rig,c))];if(errors.length)throw Error(errors.join('; '));
 if(used.size>256)throw Error('Bundle assets exceed 256 files');
 if(p.clips.length>64||p.clips.reduce((n,c)=>n+Math.round(c.duration*c.fps)*p.rig.parts.length,0)>1_000_000)throw Error('Bundle frame data exceeds limit');
 let total=0;const assets=[];
 for(const url of used){const bytes=await fs.readFile(assetPath(url));total+=bytes.length;if(total>limit)throw Error('Bundle assets exceed 32 MiB');const img=await loadImage(bytes);assets.push({url,sha256:digest(bytes),width:img.width,height:img.height,encoding:'base64',data:bytes.toString('base64')});}
 const bundle={schema:'qh-motion-bundle/1',renderer:'qh-axis-shear/1',name:p.rig.name,project:p,assets,frames:Object.fromEntries(p.clips.map(c=>[c.id,compileFrames(p.rig,c)])),skeleton:get('skeleton',character)?.skeleton??buildSkeleton(p.rig),context:get('context',character)};
 const dir=path.join(LOCAL,'exports','bundles');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,`${character}-${randomUUID()}.qhmotion`);const encoded=JSON.stringify(bundle);if(Buffer.byteLength(encoded)>90_000_000)throw Error("Bundle exceeds the 90 MB import limit");await fs.writeFile(file,encoded);return file;
}
export async function validateBundle(bundle){
 if(bundle?.schema!=='qh-motion-bundle/1'||bundle.renderer!=='qh-axis-shear/1')throw Error('Unsupported QH Motion bundle');
 const p=bundle.project;if(!p?.rig||!Array.isArray(p.clips)||p.clips.length<1||p.clips.length>64)throw Error('Bundle project required');
 const errors=[...validateRig(p.rig),...p.clips.flatMap(c=>validateClip(p.rig,c))];if(errors.length)throw Error(errors.join('; '));
 if(p.clips.reduce((n,c)=>n+Math.round(c.duration*c.fps)*p.rig.parts.length,0)>1_000_000)throw Error('Bundle frame data exceeds limit');
 if(new Set(p.clips.map(c=>c.id)).size!==p.clips.length||!p.clips.some(c=>c.id===p.selected))throw Error('Invalid bundle motion selection');
 if(!Array.isArray(bundle.assets)||bundle.assets.length>256)throw Error('Invalid bundle assets');
 const files=new Map();let total=0;
 for(const a of bundle.assets){
  if(typeof a.url!=='string'||!/^\/animations\/[a-z0-9_\-/]+\.png$/.test(a.url)||a.url.includes('..')||files.has(a.url))throw Error('Invalid or duplicate asset URL');
  if(a.encoding!=='base64'||typeof a.data!=='string'||a.data.length>28_000_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.data))throw Error('Invalid encoded asset');
  const b=Buffer.from(a.data,'base64');total+=b.length;if(total>limit)throw Error('Bundle assets exceed 32 MiB');
  if(b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||digest(b)!==a.sha256)throw Error(`Asset checksum mismatch: ${a.url}`);
  if(b.length<24||b.readUInt32BE(16)>4096||b.readUInt32BE(20)>4096)throw Error('Asset dimensions exceed 4096');
  const img=await loadImage(b);if(img.width!==a.width||img.height!==a.height)throw Error('Asset dimensions do not match manifest');files.set(a.url,b);
 }
 for(const url of new Set([...p.rig.assets,...refs({rig:p.rig,clips:p.clips})]))if(!files.has(url))throw Error(`Missing asset: ${url}`);
 for(const c of p.clips){const expected=compileFrames(p.rig,c);if(!isDeepStrictEqual(expected,bundle.frames?.[c.id]))throw Error(`Frame data does not match rig/timeline: ${c.id}`);}
 if(bundle.skeleton)validateSkeleton(bundle.skeleton,p.rig);
 return files;
}
function remap(v,mapping){if(typeof v==='string')return Object.hasOwn(mapping,v)?mapping[v]:v;if(Array.isArray(v))return v.map(n=>remap(n,mapping));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,n])=>[k,remap(n,mapping)]));return v;}
export async function importBundle(bundle,requestedId){
 const files=await validateBundle(bundle),id=safeId(requestedId??`${bundle.project.rig.id.slice(0,45)}-import-${randomUUID().slice(0,8)}`);
 if(get('project',id)||await fs.stat(path.join(PUBLIC,'animations',id)).then(()=>true).catch(()=>false))throw Error('Character already exists; import using a new ID');
 const folder=path.join(PUBLIC,'animations',id,'parts'),mapping={};await fs.mkdir(folder,{recursive:true});
 for(const [url,b]of files){const name=`${path.basename(url,'.png').slice(0,80)}-${digest(b)}.png`;await fs.writeFile(path.join(folder,name),b);mapping[url]=`/animations/${id}/parts/${name}`;}
 const p=remap(bundle.project,mapping);p.rig.id=id;p.rig.name=`${p.rig.name} copy`;p.rig.assets=[...new Set(p.rig.assets)];p.revision=0;
 return withRecordLock('bundle-import',id,()=>{
  if(get('project',id))throw Error('Character already exists');
  const saved=put('project',id,{...p,revision:1}),skeleton=remap(bundle.skeleton??buildSkeleton(p.rig),mapping);skeleton.character=id;
  put('skeleton',id,{revision:0,rigFingerprint:digest(Buffer.from(JSON.stringify(p.rig))),skeleton,history:[]});
  if(bundle.context){const context=remap(bundle.context,mapping);context.character=id;context.revision=0;put('context',id,context);}
  return saved;
 });
}
