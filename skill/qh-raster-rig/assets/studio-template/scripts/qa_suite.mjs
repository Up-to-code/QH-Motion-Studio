import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { ROOT } from "../server/paths.mjs";
import { makeMotion } from "../core/motions.mjs";
import { stateAt, drawRig } from "../core/engine.mjs";
import { loadAssets, assess, repair, exportMotion } from "../server/render.mjs";
const r = JSON.parse(
    await fs.readFile(path.join(ROOT, "public/animations/fox/rig.json")),
  ),
  cases = [];
for (const action of ["hello", "thinking", "success", "idle"]) {
  const clip = makeMotion(r, action, 24, "a");
  const fixed = await repair(r, clip, 100, 3);
  cases.push({
    action,
    status: fixed.status,
    quality: fixed.clip.quality,
    history: fixed.history.map((h) => ({
      attempt: h.attempt,
      score: h.quality.score,
    })),
  });
  const file = await exportMotion(r, fixed.clip, "gif");
  await fs.copyFile(
    file,
    path.join(ROOT, `public/animations/fox/previews/${action}.gif`),
  );
  if (action === "hello") {
    await fs.copyFile(
      await exportMotion(r, fixed.clip, "mp4"),
      path.join(ROOT, "public/animations/fox/previews/hello.mp4"),
    );
    await fs.writeFile(
      path.join(ROOT, "public/animations/fox/clips/hello.json"),
      JSON.stringify({ rig: r, clip: fixed.clip }, null, 2),
    );
  }
}
const extremes = makeMotion(r, "hello", 24);
extremes.id = "joint-extremes";
for (const [part, values] of [
  ["upper_arm_right", [-135, -115, -135]],
  ["forearm_right", [-85, 20, -85]],
  ["hand_right", [-35, 35, -35]],
]) {
  const t = extremes.tracks.find(
    (t) => t.part === part && t.property === "rotation",
  );
  t.keys = values.map((value, i) => ({
    time: (i * extremes.duration) / 2,
    value,
    ease: "smooth",
  }));
}
const q = await assess(r, extremes);
cases.push({ action: "joint-extremes", quality: q });
const assets = await loadAssets(r),
  canvas = createCanvas(1536, 640),
  ctx = canvas.getContext("2d");
ctx.fillStyle = "#fff";
ctx.fillRect(0, 0, 1536, 1024);
const clip = makeMotion(r);
for (let i = 0; i < 12; i++) {
  const tile = createCanvas(512, 512),
    tc = tile.getContext("2d");
  drawRig(tc, r, clip, (i / 11) * clip.duration, assets, {
    joints: true,
    createCanvas,
  });
  ctx.drawImage(tile, (i % 6) * 256, Math.floor(i / 6) * 320, 256, 256);
  ctx.fillStyle = "#747a90";
  ctx.font = "12px sans-serif";
  ctx.fillText(
    `${((i / 11) * clip.duration).toFixed(2)}s`,
    (i % 6) * 256 + 10,
    Math.floor(i / 6) * 320 + 280,
  );
}
await fs.writeFile(
  path.join(ROOT, "docs/fox-contact-sheet.png"),
  canvas.toBuffer("image/png"),
);
const invariants = {
  fps: [24, 30, 60].map((fps) => ({
    fps,
    atOneSecond: stateAt(r, makeMotion(r, "hello", fps), 1).map((p) => ({
      id: p.id,
      matrix: p.matrix,
    })),
  })),
};
invariants.equal =
  JSON.stringify(invariants.fps[0].atOneSecond) ===
  JSON.stringify(invariants.fps[2].atOneSecond);
const report = {
  date: "2026-10-13",
  parts: r.parts.length,
  cases,
  invariants,
  scope:
    "Technical checks plus manual frame inspection; no calibrated emotion accuracy or physical garment simulation claim.",
};
await fs.writeFile(
  path.join(ROOT, "docs/rig-qa.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  cases.map((c) => ({
    action: c.action,
    status: c.status,
    accepted: c.quality.accepted,
    score: c.quality.score,
    metrics: c.quality.metrics,
  })),
);
if (cases.some((c) => !c.quality.accepted) || !invariants.equal)
  process.exitCode = 1;
