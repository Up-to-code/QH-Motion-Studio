// Resize asset-space dimensions without moving its world joint. Pass associated
// clips to rescale local x/y and bend tracks too; omission leaves authored clips
// unchanged by design, so the caller owns all clips it wants to migrate.
export function resizePart(rig, id, size, clips = []) {
  const p = rig.parts.find((p) => p.id === id);
  if (!p || !Array.isArray(size) || size.length !== 2 ||
      size.some((n) => !Number.isFinite(n) || n <= 0 || n > 2048))
    throw Error("Invalid part size");
  const ratio = size.map((n, i) => n / p.size[i]);
  const children = rig.parts.filter((c) => c.parent === id), childIds = new Set(children.map((c) => c.id));
  const associated = Array.isArray(clips) ? clips : [clips];
  if (associated.some((c) => !c || !Array.isArray(c.tracks))) throw Error("Invalid associated clip");
  if(associated.some(c=>c.contacts!==undefined&&(!Array.isArray(c.contacts)||c.contacts.some(n=>!Array.isArray(n.point)||n.point.length!==2||n.point.some(v=>!Number.isFinite(v))))))throw Error("Invalid associated clip contacts");
  if(p.mesh?.domain)for(const key of ["size","offset","pivot"])p.mesh.domain[key]=p.mesh.domain[key].map((n,i)=>n*ratio[i]);
  p.pivot = p.pivot.map((n, i) => n * ratio[i]);
  for (const child of children) child.position = child.position.map((n, i) => n * ratio[i]);
  for (const c of rig.contacts || [])
    if (c.part === id) c.point = c.point.map((n, i) => n * ratio[i]);
  for(const clip of associated)for(const contact of clip.contacts || [])if(contact.part===id)contact.point=contact.point.map((n,i)=>n*ratio[i]);
  for (const clip of associated) for (const track of clip.tracks) {
    let factor = 1;
    if (childIds.has(track.part) && ["x", "y"].includes(track.property)) factor = ratio[track.property === "x" ? 0 : 1];
    if (track.part === id && track.property === "bend") factor = ratio[p.mesh?.axis === "x" ? 1 : 0];
    if (factor !== 1) for (const key of track.keys) key.value *= factor;
  }
  p.size = [...size];
}
// Add transparent image-space padding without resizing anatomy or child offsets.
export function padPartCoordinates(rig,id,padding,clips=[]) {
 const p=rig.parts.find(p=>p.id===id);
 if(!p||!Number.isFinite(padding)||padding<=0||padding>128)throw Error('Invalid padding');
 const oldSize=[...p.size],oldPivot=[...p.pivot];
 if(p.mesh){const domain=p.mesh.domain??{size:oldSize,pivot:oldPivot,offset:[0,0]};p.mesh.domain={...domain,offset:domain.offset.map(v=>v+padding)};}
 p.pivot=p.pivot.map(v=>v+padding);p.size=p.size.map(v=>v+2*padding);
 for(const c of [...(rig.contacts??[]),...clips.flatMap(c=>c.contacts??[])])if(c.part===id)c.point=c.point.map(v=>v+padding);
}
