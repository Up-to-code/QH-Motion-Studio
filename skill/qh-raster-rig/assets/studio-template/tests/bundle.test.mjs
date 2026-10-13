import test from 'node:test';import assert from 'node:assert/strict';import fs from'node:fs/promises';import path from'node:path';import{createCanvas}from'@napi-rs/canvas';import{createHash}from'node:crypto';
const root=await fs.mkdtemp('/tmp/qh-bundle-test-');process.env.QH_STORAGE='json';process.env.QH_DATA_DIR=root;
const{PUBLIC}=await import('../server/paths.mjs');const{put,get}=await import('../server/store.mjs');const{createBundle,validateBundle,importBundle,compileFrames}=await import('../server/bundle.mjs');
const id='bundle-fixture-'+Date.now(),url=`/animations/${id}/parts/block.png`;await fs.mkdir(path.join(PUBLIC,'animations',id,'parts'),{recursive:true});const c=createCanvas(16,16),cx=c.getContext('2d');cx.fillStyle='#f90';cx.fillRect(2,2,12,12);await fs.writeFile(path.join(PUBLIC,url),c.toBuffer('image/png'));
const rig={version:1,id,name:'Test',canvas:[64,64],origin:[32,32],ground:60,assets:[url],parts:[{id:'body',parent:null,position:[0,0],pivot:[8,8],size:[16,16],asset:url,z:0}]};const clip={id:'idle',name:'Idle',fps:24,duration:1,tracks:[]};put('project',id,{rig,clips:[clip],selected:'idle',revision:1});
const bundle=JSON.parse(await fs.readFile(await createBundle(id),'utf8'));
test('portable bundle round trips PNG, timelines and deterministic frame geometry',async()=>{
 assert.equal((await validateBundle(bundle)).size,1);assert.equal(bundle.frames.idle.length,24);
 const target=id+'-copy',p=await importBundle(bundle,target);assert.equal(p.rig.id,target);assert.notEqual(p.rig.parts[0].asset,url);assert.deepEqual(compileFrames(p.rig,p.clips[0])[0].parts[0].matrix,bundle.frames.idle[0].parts[0].matrix);assert.equal(get('project',id).rig.id,id);
 await assert.rejects(importBundle(bundle,target),/exists/);await fs.rm(path.join(PUBLIC,'animations',target),{recursive:true,force:true});
});
test('corrupt assets, missing textures, geometry and unsupported schema are rejected before import',async()=>{
 const corrupt=structuredClone(bundle);corrupt.assets[0].sha256='0'.repeat(64);await assert.rejects(validateBundle(corrupt),/checksum/);
 const missing=structuredClone(bundle);missing.assets=[];await assert.rejects(validateBundle(missing),/Missing asset/);
 const badFrame=structuredClone(bundle);badFrame.frames.idle[0].parts[0].matrix[4]+=1;await assert.rejects(validateBundle(badFrame),/Frame data/);
 const dims=structuredClone(bundle);dims.assets[0].width=99;await assert.rejects(validateBundle(dims),/dimensions/);
 await assert.rejects(validateBundle({...bundle,schema:'wrong'}),/Unsupported/);
 const attack=structuredClone(bundle);attack.assets[0].url='/animations/../../evil.png';await assert.rejects(validateBundle(attack),/asset URL/);
});
test.after(async()=>{await fs.rm(root,{recursive:true,force:true});await fs.rm(path.join(PUBLIC,'animations',id),{recursive:true,force:true});});

test('frame verification survives JSON serialization of tiny negative rotations',async()=>{const b=structuredClone(bundle);b.project.rig.parts[0].rotation=-1e-8;b.frames.idle=compileFrames(b.project.rig,b.project.clips[0]);assert.equal((await validateBundle(JSON.parse(JSON.stringify(b)))).size,1);});
