import { stateAt, point, inverse } from './engine.mjs';

const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
const finitePoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const restClip = {duration:1, tracks:[]};

/** Control anchors are authored rig pivots, never estimates from image centroids. */
export function buildSkeleton(rig) {
  const states = stateAt(rig, restClip, 0);
  const byId = new Map(states.map(p => [p.id,p]));
  const skeleton = {
    version:1, character:rig.id, coordinateSystem:'canvas-x-right-y-down',
    origin:[...rig.origin], canvas:[...rig.canvas],
    provenance:'authored-rig-pivots', status:'draft',
    nodes:states.map(p => ({id:p.id, part:p.id, parent:p.parent ?? null,
      kind:'control', rest:[...p.joint], pivot:[...p.pivot],
      restLength:p.parent ? distance(p.joint,byId.get(p.parent).joint) : distance(p.joint,rig.origin),
      lengthPolicy:p.surfaceAttachment ? 'surface' : 'parent-transform',
      contacts:[...(p.contacts || []),...(rig.contacts || []).filter(c=>c.part===p.id)].map(c => ({...c, rest:point(p.matrix,c.point)}))})),
    notes:['Confirm anatomical joints and contact intervals before authoring a new action. Control nodes include clothing and facial layers; they are not automatically anatomical bones.'],
  };
  for(const contact of rig.contacts || []) {
    const p=byId.get(contact.part);if(!p)continue;
    const rest=point(p.matrix,contact.point);
    skeleton.nodes.push({id:`contact-${p.id}-${skeleton.nodes.length}`,part:p.id,parent:p.id,kind:'control',
      rest,pivot:[...p.pivot],local:contact.point.map((v,i)=>v-p.pivot[i]),restLength:distance(rest,p.joint),lengthPolicy:'parent-transform',contact:{...contact}});
  }
  return skeleton;
}

export function skeletonPose(rig,clip,time,skeleton) {
 const states=new Map(stateAt(rig,clip,time).map(p=>[p.id,p]));
 return skeleton.nodes.filter(n=>states.has(n.part)).map(n=>{
  const p=states.get(n.part);return {id:n.id,part:n.part,parent:n.parent,kind:n.kind,rest:n.rest,position:n.local?point(p.frame,n.local):p.joint};
 });
}

export function validateSkeleton(skeleton, rig) {
  if (skeleton?.version !== 1 || skeleton.character !== rig.id) throw Error('Skeleton character/version mismatch');
  if (!['draft','confirmed'].includes(skeleton.status)) throw Error('Invalid skeleton status');
  if (!finitePoint(skeleton.origin) || !finitePoint(skeleton.canvas)) throw Error('Finite skeleton origin/canvas required');
  if (!Array.isArray(skeleton.nodes) || skeleton.nodes.length > 1000) throw Error('Skeleton nodes required');
  const ids = new Set();
  const parts = new Set(rig.parts.map(p=>p.id));
  for (const n of skeleton.nodes) {
    if (typeof n.id !== 'string' || ids.has(n.id)) throw Error('Unique skeleton node IDs required');
    ids.add(n.id);
    if (!parts.has(n.part) || !finitePoint(n.rest) || !finitePoint(n.pivot) || !Number.isFinite(n.restLength) || n.restLength < 0) throw Error(`Invalid skeleton node ${n.id}`);
    if (!['control','anatomical'].includes(n.kind)) throw Error('Declare control or anatomical node');
    if (n.local && !finitePoint(n.local)) throw Error('Finite local anatomical anchor required');
    if (!['parent-transform','surface','free'].includes(n.lengthPolicy)) throw Error('Declare length policy');
  }
  const byId = new Map(skeleton.nodes.map(n=>[n.id,n]));
  for (const n of skeleton.nodes) {
    const visited = new Set([n.id]); let p=n.parent;
    while(p) {
      if (!byId.has(p) || visited.has(p)) throw Error('Missing parent or skeleton cycle');
      visited.add(p); p=byId.get(p).parent;
    }
  }
  return skeleton;
}

/** A coordinate mismatch is measured against an independent saved rest contract. */
export function inspectSkeleton(rig, clip, skeleton, {samples=25, tolerance=.5}={}) {
  validateSkeleton(skeleton,rig);
  if (!Number.isInteger(samples) || samples < 2 || samples > 600 || !Number.isFinite(tolerance) || tolerance < 0) throw Error('Invalid inspection settings');
  const rest = new Map(stateAt(rig,restClip,0).map(p=>[p.id,p]));
  const findings=[];
  const add=(category,n,error,time,position) => findings.push({category,node:n.id,part:n.part,error,time,position,units:category==='parent-contract-drift'?'topology-violations':'canvas-pixels'});
  for(const n of skeleton.nodes) {
    const p=rest.get(n.part), anchor=n.local ? point(p.frame,n.local):p.joint;
    if (!n.local && (p.parent ?? null) !== n.parent) add('parent-contract-drift',n,1,0,anchor);
    const error=distance(anchor,n.rest);
    if(error>tolerance) add('rest-anchor-drift',n,error,0,anchor);
    if(distance(n.pivot,p.pivot)>tolerance && !n.local) add('pivot-contract-drift',n,distance(n.pivot,p.pivot),0,anchor);
  }
  const frames=[];
  for(let f=0;f<samples;f++) {
    const time=clip.duration*f/(samples-1);
    const states=new Map(stateAt(rig,clip,time).map(p=>[p.id,p]));
    const nodes=skeleton.nodes.map(n=>{
      const p=states.get(n.part);
      return {...n,position:n.local?point(p.frame,n.local):p.joint};
    });
    const byId=new Map(nodes.map(n=>[n.id,n]));
    for(const n of nodes) {
      if(!n.parent || n.lengthPolicy!=='parent-transform') continue;
      const parent=byId.get(n.parent), parentPart=states.get(parent.part);
      // Measure in parent's local coordinates: rotation and nonuniform scale must not count as bone stretching.
      const relative=point(inverse(parentPart.frame),n.position);
      const parentLocal=point(inverse(parentPart.frame),parent.position);
      const restRelative=point(inverse(rest.get(parent.part).frame),n.rest);
      const restParent=point(inverse(rest.get(parent.part).frame),parent.rest);
      const error=Math.abs(distance(relative,parentLocal)-distance(restRelative,restParent));
      if(error>tolerance) add('bone-length-change',n,error,time,n.position);
    }
    frames.push({time,nodes:nodes.map(n=>({id:n.id,parent:n.parent,position:n.position}))});
  }
  return {passed:findings.length===0,confirmed:skeleton.status==='confirmed',findings,frames,
    scope:'Saved anchor and length consistency; does not infer anatomy or certify artwork seams.'};
}
