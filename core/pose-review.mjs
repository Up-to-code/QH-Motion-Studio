// Authored landmarks are measurements, not predictions of anatomy or emotion.
export function reviewPoseSequence(frames,{origin=[256,300],maxRootError=.5,maxScaleDrift=.06,camera='right'}={}){
 if(!Array.isArray(frames)||frames.length<2)throw Error('At least two measured poses required');
 const issues=[],scales=frames.map(f=>f.scale),median=[...scales].sort((a,b)=>a-b)[Math.floor(scales.length/2)];
 for(const [i,f]of frames.entries()){
  if(!Array.isArray(f.registeredRoot)||f.registeredRoot.length!==2||f.registeredRoot.some(x=>!Number.isFinite(x))||!Number.isFinite(f.scale)||f.scale<=0)throw Error('Finite root and positive uniform scale required');
  const error=Math.hypot(...f.registeredRoot.map((x,j)=>x-origin[j]-(f.intentionalRootOffset?.[j]??0)));if(error>maxRootError)issues.push({frame:i,type:'root-drift',pixels:error});
  if(Math.abs(f.scale/median-1)>maxScaleDrift)issues.push({frame:i,type:'scale-pop',ratio:f.scale/median});
  if(f.camera!==camera)issues.push({frame:i,type:'camera-change'});
  if(f.sourceTouchesEdge)issues.push({frame:i,type:'source-crop'});
  if(f.mouth&&f.nose&&(f.mouth[1]<=f.nose[1]||Math.abs(f.mouth[0]-f.nose[0])>f.muzzleWidth/2))issues.push({frame:i,type:'mouth-outside-muzzle'});
 }
 return{passed:issues.length===0,issues,scope:'Authored root, uniform scale, camera and source bounds. Gait, clothing ownership and emotion need visual review; no inferred depth or emotion score.'};
}
