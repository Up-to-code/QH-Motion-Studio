import test from 'node:test';import assert from 'node:assert/strict';
import {regions,overlapCount,pixelDifference} from '../core/regions.mjs';
test('tiles partition rectangular canvas exactly with overlapping halos',()=>{
 const result=regions(19,10,8,2),counts=new Uint8Array(190);
 for(const r of result){const[x,y,w,h]=r.core;for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)counts[j*19+i]++;}
 assert(counts.every(n=>n===1));assert.deepEqual(result[1].bounds,[6,0,12,10]);
});
test('boundary errors remain represented in adjacent halo packets',()=>{
 const a=new Uint8Array(16*8*4),b=a.slice();b[(3*16+8)*4+3]=255;
 const result=pixelDifference(a,b,16,8,8,2);assert.equal(result[1].changed,1);
 assert(result.every(r=>r.bounds[0]<=8 && r.bounds[0]+r.bounds[2]>8));
});
test('overlap requires both masks rather than either parent or child coverage',()=>{
 const a=new Uint8Array(4*4*4),b=a.slice();a[3]=255;b[7]=255;
 assert.equal(overlapCount(a,b,[0,0,4,4],4,4),0);b[3]=255;
 assert.equal(overlapCount(a,b,[0,0,4,4],4,4),1);
});
