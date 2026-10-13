// Resize asset-space dimensions without moving its world joint. Child attachments,
// surface pivots and contact markers change in the same local units, reversibly.
export function resizePart(rig, id, size) {
  const p = rig.parts.find((p) => p.id === id);
  if (!p || size.some((n) => !Number.isFinite(n) || n <= 0 || n > 2048))
    throw Error("Invalid part size");
  const ratio = size.map((n, i) => n / p.size[i]);
  p.pivot = p.pivot.map((n, i) => n * ratio[i]);
  for (const child of rig.parts.filter((c) => c.parent === id))
    child.position = child.position.map((n, i) => n * ratio[i]);
  for (const c of rig.contacts || [])
    if (c.part === id) c.point = c.point.map((n, i) => n * ratio[i]);
  p.size = [...size];
}
