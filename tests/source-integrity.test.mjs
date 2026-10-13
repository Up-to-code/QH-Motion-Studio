import test from 'node:test';import assert from 'node:assert/strict';import {sourceMargins} from '../core/source-integrity.mjs';
test('source crop risk is detected independently of the final canvas bounds',()=>{
 const a=new Uint8ClampedArray(10*10*4);for(let y=2;y<10;y++)for(let x=2;x<8;x++)a[(y*10+x)*4+3]=255;
 const r=sourceMargins(a,10,10);assert.equal(r.edgePixels,6);assert.equal(r.margins[3],0);
});
test('empty and safely padded source assets are distinguished',()=>{
 const a=new Uint8ClampedArray(10*10*4);assert.equal(sourceMargins(a,10,10).empty,true);for(let y=2;y<8;y++)for(let x=2;x<8;x++)a[(y*10+x)*4+3]=255;
 assert.deepEqual(sourceMargins(a,10,10).margins,[2,2,2,2]);assert.equal(sourceMargins(a,10,10).edgePixels,0);
});
