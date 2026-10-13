import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { drawRig, stateAt } from "../core/engine.mjs";
import { drawMesh } from "../core/mesh.mjs";
import { signedDistance } from "../core/analysis.mjs";
export async function exportAnalysis(rig, clip, images, dir) {
  await fs.mkdir(dir, { recursive: true });
  const [w, h] = rig.canvas,
    canvas = createCanvas(w, h),
    ctx = canvas.getContext("2d");
  drawRig(ctx, rig, clip, 0, images, { createCanvas });
  const rgba = ctx.getImageData(0, 0, w, h).data,
    mask = Uint8Array.from({ length: w * h }, (_, i) =>
      rgba[i * 4 + 3] > 128 ? 1 : 0,
    ),
    ids = new Uint16Array(w * h),
    order = new Float32Array(w * h),
    parts = [];
  await fs.writeFile(path.join(dir, "bind.png"), canvas.toBuffer("image/png"));
  const states = stateAt(rig, clip, 0);
  for (let i = 0; i < states.length; i++) {
    const p = states[i];
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.transform(...p.matrix);
    if (p.mesh) drawMesh(ctx, images[p.asset], p, p.bend, createCanvas);
    else ctx.drawImage(images[p.asset], 0, 0, ...p.size);
    ctx.restore();
    await fs.writeFile(
      path.join(dir, p.id + "-layer.png"),
      canvas.toBuffer("image/png"),
    );
    const a = ctx.getImageData(0, 0, w, h).data;
    if (p.visible)
      for (let k = 0; k < ids.length; k++)
        if (a[4 * k + 3] > 128) {
          ids[k] = i + 1;
          order[k] = p.z;
        }
    parts.push({
      numericId: i + 1,
      id: p.id,
      parent: p.parent,
      visible: p.visible,
      asset: p.asset,
      pivot: p.pivot,
      joint: p.joint,
      matrix: p.matrix,
      size: p.size,
      layer: p.id + "-layer.png",
    });
  }
  const fields = [
    ["visible-part-ids.u16", ids, "uint16"],
    ["draw-order.f32", order, "float32"],
    ["boundary-distance.f32", signedDistance(mask, w, h), "float32"],
  ];
  for (const [file, array] of fields)
    await fs.writeFile(path.join(dir, file), Buffer.from(array.buffer));
  const manifest = {
    schema: "qh-analysis/1",
    canvas: rig.canvas,
    origin: rig.origin,
    ground: rig.ground,
    units: "asset pixels",
    endianness: "little",
    layout: "row-major",
    fields: fields.map(([file, _, type]) => ({ file, type })),
    provenance: {
      partIds: "authored visible rig ownership",
      order: "authored ordinal z, not metric depth",
      distance: "computed approximate signed chamfer distance from alpha",
      joints: "authored pivots, not detected by a vision model",
    },
    parts,
    rig,
    clip,
  };
  const file = path.join(dir, "analysis.json");
  await fs.writeFile(file, JSON.stringify(manifest, null, 2));
  return file;
}
