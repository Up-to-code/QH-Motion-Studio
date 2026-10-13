import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { drawRig } from "../core/engine.mjs";
import { makeMotion } from "../core/motions.mjs";
import { loadAssets } from "../server/render.mjs";
import { ROOT } from "../server/paths.mjs";
const r = JSON.parse(
    await fs.readFile(path.join(ROOT, "public/animations/fox/rig.json")),
  ),
  images = await loadAssets(r),
  clip = makeMotion(r, "hello", 24),
  out = path.resolve(process.argv[2] || (()=>{throw Error("Pass the destination app root as an argument")})(), "assets/animations/fox");
await fs.mkdir(out, { recursive: true });
const frames = Math.round(clip.duration * clip.fps),
  cell = 256,
  columns = 9,
  rows = Math.ceil(frames / columns),
  atlas = createCanvas(columns * cell, rows * cell),
  ac = atlas.getContext("2d");
for (let i = 0; i < frames; i++) {
  const c = createCanvas(512, 512),
    ctx = c.getContext("2d");
  drawRig(ctx, r, clip, i / clip.fps, images, { createCanvas });
  ac.drawImage(
    c,
    (i % columns) * cell,
    Math.floor(i / columns) * cell,
    cell,
    cell,
  );
}
await fs.writeFile(
  path.join(out, "hello-atlas.png"),
  atlas.toBuffer("image/png"),
);
for (const pose of ["idle", "thinking", "success", "retry"]) {
  const c = createCanvas(512, 512),
    ctx = c.getContext("2d"),
    action = pose === "retry" ? "thinking" : pose === "idle" ? "idle" : pose,
    motion = makeMotion(r, action);
  drawRig(ctx, r, motion, pose === "idle" ? 0 : motion.duration * 0.5, images, {
    createCanvas,
  });
  await fs.writeFile(path.join(out, pose + ".png"), c.toBuffer("image/png"));
}
await fs.writeFile(
  path.join(out, "runtime.json"),
  JSON.stringify(
    {
      version: 1,
      fps: clip.fps,
      frameCount: frames,
      durationSeconds: clip.duration,
      columns,
      rows,
      cell,
      canvas: r.canvas,
      origin: r.origin,
      rigSource: "QH-Motion-Studio/public/animations/fox/rig.json",
      parts: r.parts.length,
    },
    null,
    2,
  ),
);
await fs.writeFile(path.join(out, "rig.json"), JSON.stringify(r, null, 2));
console.log(out);
