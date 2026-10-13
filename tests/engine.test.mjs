import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  mul,
  translate,
  rotate,
  point,
  stateAt,
  validateRig,
  validateClip,
  sample,
  smooth,
} from "../core/engine.mjs";
import { makeMotion } from "../core/motions.mjs";
import { triangleMatrix, meshMetrics } from "../core/mesh.mjs";
import { signedDistance, connectedCoverage } from "../core/analysis.mjs";
const rig = JSON.parse(
  fs.readFileSync(
    new URL("../public/animations/fox/rig.json", import.meta.url),
  ),
);
test("hierarchical hand attachment follows parent rather than image pivot", () => {
  const c = makeMotion(rig),
    state = stateAt(rig, c, 1.1),
    fore = state.find((p) => p.id === "forearm_right"),
    hand = state.find((p) => p.id === "hand_right"),
    part = rig.parts.find((p) => p.id === "hand_right");
  assert.deepEqual(hand.joint, point(fore.frame, part.position));
  assert.deepEqual(
    state.find((p) => p.id === "shoe_left").joint,
    stateAt(rig, c, 0).find((p) => p.id === "shoe_left").joint,
  );
});
test("continuous-time state is independent of fps and evaluation order", () => {
  const clips = [24, 30, 60].map((f) => makeMotion(rig, "hello", f));
  for (const t of [0, 1.5, 0.4, 3, 1.5])
    assert.deepEqual(stateAt(rig, clips[0], t), stateAt(rig, clips[2], t));
  assert.deepEqual(stateAt(rig, clips[0], 0), stateAt(rig, clips[0], 3));
});
test("correct image-to-world pivot rotation", () => {
  const m = mul(translate(30, 40), rotate(90));
  const p = point(m, [10, 0]);
  assert.ok(Math.abs(p[0] - 30) < 1e-8);
  assert.ok(Math.abs(p[1] - 50) < 1e-8);
});
test("validation rejects hierarchy cycles, unknown assets, nonfinite values", () => {
  assert.deepEqual(validateRig(rig), []);
  const r = structuredClone(rig);
  r.parts[0].parent = r.parts[0].id;
  assert.match(validateRig(r).join(), /cycle/);
  const c = makeMotion(rig);
  c.tracks[0].keys[0].value = NaN;
  assert.match(validateClip(rig, c).join(), /Numeric/);
  const d = makeMotion(rig);
  d.tracks.find((t) => t.property === "asset").keys[0].value = "/etc/passwd";
  assert.match(validateClip(rig, d).join(), /Unregistered/);
});
test("triangle affine warp maps all three vertices exactly", () => {
  const a = [
      [0, 0],
      [20, 0],
      [0, 10],
    ],
    b = [
      [5, 7],
      [25, 10],
      [3, 20],
    ],
    m = triangleMatrix(a, b);
  for (let i = 0; i < 3; i++)
    assert.ok(Math.hypot(...point(m, a[i]).map((n, j) => n - b[i][j])) < 1e-8);
  assert.equal(
    meshMetrics(
      rig.parts.find((p) => p.id === "tail"),
      12,
    ).flippedTriangles,
    0,
  );
});
test("numeric maps identify disconnected islands and boundary sign", () => {
  const mask = new Uint8Array(25);
  mask[6] = mask[7] = mask[11] = mask[12] = mask[24] = 1;
  const q = connectedCoverage(mask, 5, 5);
  assert.equal(q.components, 2);
  assert.equal(q.ratio, 0.8);
  const d = signedDistance(mask, 5, 5);
  assert.ok(d[6] > 0);
  assert.ok(d[0] < 0);
});
test("smoothstep and discrete replacements have deterministic endpoints", () => {
  assert.equal(smooth(0), 0);
  assert.equal(smooth(1), 1);
  assert.equal(
    sample(
      [
        { time: 0, value: "rest" },
        { time: 1, value: "happy" },
      ],
      0.9,
      true,
    ),
    "rest",
  );
  assert.equal(
    sample(
      [
        { time: 0, value: "rest" },
        { time: 1, value: "happy" },
      ],
      1,
      true,
    ),
    "happy",
  );
});
test("cloth details follow surface deformation and secondary motion is bounded", () => {
  const c = makeMotion(rig),
    r = structuredClone(rig),
    shirt = r.parts.find((p) => p.id === "hoodie");
  shirt.mesh = { columns: 4, rows: 4, axis: "y" };
  const pocket = r.parts.find((p) => p.id === "pocket");
  if (!pocket) return;
  pocket.surfaceAttachment = true;
  c.tracks.push({
    part: "hoodie",
    property: "bend",
    keys: [
      { time: 0, value: 0 },
      { time: 1, value: 10 },
      { time: 3, value: 0 },
    ],
  });
  const a = stateAt(r, c, 0).find((p) => p.id === "pocket"),
    b = stateAt(r, c, 1).find((p) => p.id === "pocket");
  assert.ok(b.joint[0] > a.joint[0]);
  for (const t of [1.3, 0.3, 2.7, 1.3]) {
    const s = stateAt(r, c, t);
    for (const part of s.filter((p) => p.secondary))
      assert.ok(Math.abs(part.rotation) <= part.secondary.maxDegrees);
  }
  assert.deepEqual(
    stateAt(r, c, 0).map((p) => p.frame),
    stateAt(r, c, 3).map((p) => p.frame),
  );
});
test("resizing then restoring a part preserves pivots and child attachments", async () => {
  const { resizePart } = await import("../core/edit.mjs");
  const r = structuredClone(rig),
    p = r.parts.find((p) => p.id === "upper_arm_right"),
    size = [...p.size],
    before = structuredClone(r);
  resizePart(
    r,
    p.id,
    size.map((v) => v * 1.5),
  );
  resizePart(r, p.id, size);
  for (const part of r.parts) {
    const old = before.parts.find((p) => p.id === part.id);
    for (let i = 0; i < 2; i++) {
      assert.ok(Math.abs(part.pivot[i] - old.pivot[i]) < 1e-8);
      assert.ok(Math.abs(part.position[i] - old.position[i]) < 1e-8);
    }
  }
});
test("deformed raster triangles have no transparent interior seams", async () => {
  const { createCanvas } = await import("@napi-rs/canvas"),
    { drawMesh } = await import("../core/mesh.mjs");
  const source = createCanvas(100, 100),
    s = source.getContext("2d");
  s.fillStyle = "#f80";
  s.fillRect(0, 0, 100, 100);
  const out = createCanvas(140, 120),
    ctx = out.getContext("2d");
  ctx.translate(10, 10);
  drawMesh(
    ctx,
    source,
    {
      size: [100, 100],
      pivot: [50, 0],
      mesh: { columns: 5, rows: 6, axis: "y" },
    },
    12,
    createCanvas,
  );
  const data = ctx.getImageData(35, 20, 60, 70).data;
  let min = 255;
  for (let i = 3; i < data.length; i += 4) min = Math.min(min, data[i]);
  assert.equal(min, 255);
});
test('wave replacement art covers the registered wrist and points along the hand bone',async()=>{
 const {createCanvas,loadImage}=await import('@napi-rs/canvas');
 const image=await loadImage('public/animations/fox/parts/hand_wave_registered.png');
 const c=createCanvas(35,44),ctx=c.getContext('2d');ctx.drawImage(image,0,0);
 assert.ok(ctx.getImageData(17,9,1,1).data[3]>200,'Wrist anchor lies on opaque art');
 assert.ok(ctx.getImageData(17,35,1,1).data[3]>200,'Fingers extend outward from wrist');
 const clip=makeMotion(rig,'hello');assert.equal(clip.tracks.find(t=>t.part==='hand_right'&&t.property==='asset').keys[1].value,'/animations/fox/parts/hand_wave_registered.png');
});
