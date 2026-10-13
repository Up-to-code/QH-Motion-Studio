import{stateAt,inverse,point,translate}from'./engine.mjs';
// A drawn canvas path is compiled into parent-local x/y keys, not viewport units.
export function pathTracks(rig,clip,id,points){
 const part=rig.parts.find(p=>p.id===id);if(!part||part.surfaceAttachment)throw Error('Draw paths on a rigid part; surface attachments use their mesh controls');
 if(!Array.isArray(points)||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v))))throw Error('Finite canvas points required');
 const clean=points.filter((p,i)=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&(!i||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>.1));
 if(clean.length<2||clean.length>500)throw Error('A motion path requires 2–500 distinct points');
 const distances=[0];for(let i=1;i<clean.length;i++)distances.push(distances[i-1]+Math.hypot(clean[i][0]-clean[i-1][0],clean[i][1]-clean[i-1][1]));
 const length=distances.at(-1);if(!length)throw Error('Motion path has zero length');
 const rest=stateAt(rig,clip,0).find(p=>p.id===id),keys=clean.map((p,i)=>{const time=distances[i]/length*clip.duration,states=stateAt(rig,clip,time),parent=part.parent?states.find(p=>p.id===part.parent).frame:translate(...rig.origin);return {time,local:point(inverse(parent),[rest.joint[0]+p[0]-clean[0][0],rest.joint[1]+p[1]-clean[0][1]])};});
 return ['x','y'].map((property,j)=>({part:id,property,keys:keys.map(k=>({time:k.time,value:k.local[j],ease:'linear'}))}));
}
