import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import {createCanvas} from '@napi-rs/canvas';
import {importAsset} from '../server/service.mjs';import {PUBLIC} from '../server/paths.mjs';
test('raster imports preserve prior artwork using content-addressed filenames',async()=>{
 const id=`upload-fixture-${randomUUID().slice(0,8)}`,folder=path.join(PUBLIC,'animations',id);
 const png=color=>{const c=createCanvas(2,2),ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,2,2);return c.toBuffer('image/png');};
 try{
  const a=png('#f80'),b=png('#08f');const first=await importAsset(id,'arm',a.toString('base64')),second=await importAsset(id,'arm',b.toString('base64'));
  assert.notEqual(first.asset,second.asset);assert.equal(first.sha256.length,64);assert.deepEqual(await fs.readFile(path.join(PUBLIC,first.asset)),a);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
