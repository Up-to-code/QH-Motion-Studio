// Inputs are measured shoe/head positions and authored phase labels.
// This check does not infer anatomical side ownership from an image.
export function reviewRunGait(samples,{groundY,contactTolerance=3,maxFlightClearance=12,maxHeadTravel=14,maxFlightFraction=.3}={}){
 if(!Array.isArray(samples)||samples.length<4||!Number.isFinite(groundY))throw Error('A cycle and finite floor required');
 const issues=[];let flights=0;const heads=[];
 for(const[i,s]of samples.entries()){
  if(!Number.isFinite(s.lowestFootY)||!Number.isFinite(s.headY)||!['contact','flight'].includes(s.phase))throw Error('Measured foot/head and authored phase required');
  const clearance=groundY-s.lowestFootY;heads.push(s.headY);
  if(s.phase==='contact'&&Math.abs(clearance)>contactTolerance)issues.push({frame:i,type:'unplanted-foot',pixels:clearance});
  if(s.phase==='flight'){flights++;if(clearance< -contactTolerance||clearance>maxFlightClearance)issues.push({frame:i,type:'excess-flight',pixels:clearance});}
 }
 const headTravel=Math.max(...heads)-Math.min(...heads);if(headTravel>maxHeadTravel)issues.push({type:'excess-body-bounce',pixels:headTravel});
 if(flights/samples.length>maxFlightFraction)issues.push({type:'too-much-flight',fraction:flights/samples.length});
 return{passed:!issues.length,issues,headTravel,flightFraction:flights/samples.length,scope:'Measured floor contact, flight clearance and head travel. Alternating leg identity, counter-swing, knee articulation and perceived running still require visual review.'};
}
