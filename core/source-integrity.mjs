// A source-edge test detects crop risk, not whether a hidden anatomical part exists.
export function sourceMargins(data,width,height,threshold=16) {
 let left=width,top=height,right=-1,bottom=-1,edgePixels=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>threshold){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);if(!x||!y||x===width-1||y===height-1)edgePixels++;}
 return {empty:right<0,bounds:right<0?null:[left,top,right-left+1,bottom-top+1],margins:right<0?[0,0,0,0]:[left,top,width-1-right,height-1-bottom],edgePixels};
}
