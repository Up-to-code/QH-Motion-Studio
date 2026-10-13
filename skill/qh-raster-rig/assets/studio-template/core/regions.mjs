/** Partition analysis coordinates, not artwork. Halo prevents blind spots at tile borders. */
export function regions(width,height,size=32,halo=4) {
 if (![width,height,size,halo].every(Number.isInteger) || width<1 || height<1 || size<1 || halo<0) throw Error('Invalid region dimensions');
 const result=[];
 for(let y=0;y<height;y+=size) for(let x=0;x<width;x+=size) {
  const w=Math.min(size,width-x),h=Math.min(size,height-y);
  result.push({id:`${x}-${y}`,core:[x,y,w,h],bounds:[Math.max(0,x-halo),Math.max(0,y-halo),Math.min(width,x+w+halo)-Math.max(0,x-halo),Math.min(height,y+h+halo)-Math.max(0,y-halo)]});
 }
 return result;
}
export function overlapCount(a,b,bounds,width,height,threshold=80) {
 let count=0;const [x,y,w,h]=bounds;
 for(let j=Math.max(0,Math.floor(y));j<Math.min(height,Math.ceil(y+h));j++)
 for(let i=Math.max(0,Math.floor(x));i<Math.min(width,Math.ceil(x+w));i++)
 if(a[(j*width+i)*4+3]>threshold && b[(j*width+i)*4+3]>threshold) count++;
 return count;
}
export function pixelDifference(a,b,width,height,size=32,halo=4) {
 if(a.length!==width*height*4 || b.length!==a.length) throw Error('RGBA size mismatch');
 return regions(width,height,size,halo).map(region=>{
  let max=0,sum=0,changed=0;const[x,y,w,h]=region.core;
  for(let j=y;j<y+h;j++) for(let i=x;i<x+w;i++) {
   const offset=(j*width+i)*4;let error=0;
   for(let c=0;c<4;c++) error=Math.max(error,Math.abs(a[offset+c]-b[offset+c]));
   max=Math.max(max,error);sum+=error;if(error)changed++;
  }
  return {...region,max,mean:sum/(w*h),changed};
 });
}
