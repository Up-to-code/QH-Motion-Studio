import { zipDirectory } from "./zip.mjs";
import { exportAnalysis } from "./analysis-export.mjs";
import { connectedCoverage } from "../core/analysis.mjs";
import { meshMetrics, vertices } from "../core/mesh.mjs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  drawRig,
  stateAt,
  point,
  validateClip,
  validateRig,
} from "../core/engine.mjs";
import { assetPath, LOCAL, safeId } from "./paths.mjs";
export async function loadAssets(rig) {
  return Object.fromEntries(
    await Promise.all(
      rig.assets.map(async (a) => [a, await loadImage(assetPath(a))]),
    ),
  );
}
export async function assess(rig, clip) {
  const errors = [...validateRig(rig), ...validateClip(rig, clip)];
  if (errors.length) return { score: 0, accepted: false, errors };
  const images = await loadAssets(rig);
  const canvas = createCanvas(...rig.canvas),
    ctx = canvas.getContext("2d");
  const count = Math.max(2, Math.round(clip.duration * clip.fps));
  let clipped = 0,
    total = 0,
    contact = 0,
    limit = 0,
    maxStep = 0,
    maxGap = 0,
    minConnected = 1,
    flips = 0,
    offCanvas = 0;
  let previous = null;
  const sampled = [];
  for (let f = 0; f < count; f++) {
    const t = (f / (count - 1)) * clip.duration,
      s = stateAt(rig, clip, t);
    drawRig(ctx, rig, clip, t, images, { createCanvas });
    const a = ctx.getImageData(0, 0, ...rig.canvas).data;
    let occupied = 0,
      edge = 0;
    for (let i = 3; i < a.length; i += 4)
      if (a[i] > 80) {
        occupied++;
        const px = ((i - 3) / 4) % rig.canvas[0],
          py = Math.floor((i - 3) / 4 / rig.canvas[0]);
        if (
          px < 2 ||
          py < 2 ||
          px >= rig.canvas[0] - 2 ||
          py >= rig.canvas[1] - 2
        )
          edge++;
      }
    total += occupied;
    clipped += edge;
    const coverage = connectedCoverage(
      Uint8Array.from({ length: rig.canvas[0] * rig.canvas[1] }, (_, i) =>
        a[i * 4 + 3] > 128 ? 1 : 0,
      ),
      ...rig.canvas,
    );
    if (rig.mode !== "poses")
      minConnected = Math.min(minConnected, coverage.ratio);
    for (const c of rig.contacts || []) {
      const p = s.find((p) => p.id === c.part);
      const rest = stateAt(rig, clip, 0).find((p) => p.id === c.part);
      contact = Math.max(
        contact,
        Math.hypot(
          ...point(p.matrix, c.point).map(
            (n, i) => n - point(rest.matrix, c.point)[i],
          ),
        ),
      );
    }
    for (const p of s) {
      if (p.visible) {
        if (p.mesh) flips += meshMetrics(p, p.bend).flippedTriangles;
        const corners = p.mesh
          ? vertices(p, p.bend).map((v) => v.target)
          : [[0, 0], [p.size[0], 0], [0, p.size[1]], p.size];
        const world = corners.map((v) => point(p.matrix, v));
        if (
          world.every((v) => v[0] < 0) ||
          world.every((v) => v[1] < 0) ||
          world.every((v) => v[0] > rig.canvas[0]) ||
          world.every((v) => v[1] > rig.canvas[1])
        )
          offCanvas++;
      }
      if (p.limits) {
        const [min, max] = p.limits;
        if (p.rotation < min || p.rotation > max)
          limit = Math.max(limit, Math.max(min - p.rotation, p.rotation - max));
      }
      if (p.parent) {
        const parent = s.find((x) => x.id === p.parent);
        const joint = p.joint;
        let cover = 0;
        for (const part of [p, parent]) {
          const one = createCanvas(...rig.canvas),
            oc = one.getContext("2d");
          oc.transform(...part.matrix);
          oc.drawImage(images[part.asset], 0, 0, ...part.size);
          const x = Math.round(joint[0]),
            y = Math.round(joint[1]);
          if (x >= 0 && y >= 0 && x < rig.canvas[0] && y < rig.canvas[1]) {
            const d = oc.getImageData(
              Math.max(0, x - 2),
              Math.max(0, y - 2),
              5,
              5,
            ).data;
            cover += Array.from(d).filter(
              (v, i) => i % 4 === 3 && v > 80,
            ).length;
          }
        } // Visible body joints need coverage; facial overlays attach on a head plate.
        if (/upper_arm|forearm|hand|leg_|shoe_|ear_/.test(p.id) && cover === 0)
          maxGap++;
      }
      if (previous) {
        const prev = previous.find((x) => x.id === p.id);
        maxStep = Math.max(
          maxStep,
          Math.hypot(p.joint[0] - prev.joint[0], p.joint[1] - prev.joint[1]),
        );
      }
    }
    previous = s;
    if (f % Math.max(1, Math.floor(count / 12)) === 0)
      sampled.push({ frame: f, time: t });
  }
  const start = stateAt(rig, clip, 0),
    end = stateAt(rig, clip, clip.duration);
  const loop = Math.max(
    ...start.map((p, i) =>
      Math.max(...p.matrix.map((n, j) => Math.abs(n - end[i].matrix[j]))),
    ),
  );
  const penalties = {
    disconnection: Math.min(30, (1 - minConnected) * 200),
    meshFlips: Math.min(30, flips),
    offCanvas: Math.min(30, offCanvas * 5),
    clipping: Math.min(25, (clipped / Math.max(1, total)) * 10000),
    contact: Math.min(25, contact * 2),
    limits: Math.min(20, limit),
    jointGaps: Math.min(30, maxGap * 2),
    loop: Math.min(20, loop * 2),
    speed: Math.max(
      0,
      Math.min(15, ((maxStep * (count - 1)) / clip.duration - 432) / 60),
    ),
  };
  const score = Number(
    Math.max(
      0,
      100 - Object.values(penalties).reduce((a, b) => a + b, 0),
    ).toFixed(2),
  );
  return {
    score,
    accepted:
      score >= 95 &&
      maxGap === 0 &&
      contact <= 0.5 &&
      clipped === 0 &&
      limit === 0 &&
      minConnected >= 0.995 &&
      flips === 0 &&
      offCanvas === 0,
    metrics: {
      connectedBodyRatio: minConnected,
      flippedTriangles: flips,
      offCanvasSamples: offCanvas,
      contactDriftPx: contact,
      loopMatrixError: loop,
      jointGapSamples: maxGap,
      edgePixels: clipped,
      maxJointStepPx: maxStep,
      maxJointVelocityPxPerSecond: (maxStep * (count - 1)) / clip.duration,
      limitOverrunDeg: limit,
    },
    penalties,
    sampled,
    scope:
      "Numeric bounds, attachment coverage, contact, limits, speed and loop. Artistic naturalness and identity require visual review.",
  };
}
export async function repair(rig, clip, target = 95, maxAttempts = 3) {
  let current = structuredClone(clip);
  const history = [];
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const q = await assess(rig, current);
    history.push({ attempt, quality: q });
    if (q.accepted && q.score >= target)
      return {
        clip: { ...current, quality: q, score: q.score },
        history,
        status: "accepted",
      };
    if (attempt === maxAttempts) break;
    if (q.metrics?.maxJointVelocityPxPerSecond > 432) {
      const ratio = Math.min(2, q.metrics.maxJointVelocityPxPerSecond / 400);
      if (current.duration * ratio <= 30) {
        current.duration *= ratio;
        for (const track of current.tracks)
          for (const key of track.keys) key.time *= ratio;
      }
    }
    for (const t of current.tracks) {
      const p = rig.parts.find((p) => p.id === t.part);
      if (t.property === "rotation" && p?.limits)
        t.keys = t.keys.map((k) => ({
          ...k,
          value: Math.min(p.limits[1], Math.max(p.limits[0], k.value)),
        }));
      if (
        /shoe_|leg_/.test(t.part) &&
        ["x", "y", "rotation"].includes(t.property)
      )
        t.keys = t.keys.map((k) => ({
          ...k,
          value:
            t.property === "rotation"
              ? 0
              : p.position[t.property === "x" ? 0 : 1],
        }));
    } // Repair only declared limits and planted contacts. Artwork gaps stay explicit.
  }
  return {
    clip: {
      ...current,
      quality: history.at(-1).quality,
      score: history.at(-1).quality.score,
    },
    history,
    status: "needs-art-review",
  };
}
function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.QH_FFMPEG || "ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (c) =>
      c === 0 ? resolve() : reject(Error(err.slice(-1600))),
    );
  });
}
export async function exportMotion(rig, clip, format = "json") {
  safeId(rig.id);
  safeId(clip.id);
  if (!["json", "gif", "mp4", "frames", "analysis"].includes(format))
    throw Error("Unsupported format");
  const errors = [...validateRig(rig), ...validateClip(rig, clip)];
  if (errors.length) throw Error(errors.join("; "));
  const dir = path.join(LOCAL, "exports", `${rig.id}-${clip.id}-${clip.fps}`);
  await fs.mkdir(dir, { recursive: true });
  if (format === "analysis") {
    const folder = path.join(dir, "analysis");
    await exportAnalysis(rig, clip, await loadAssets(rig), folder);
    return zipDirectory(folder, path.join(dir, "analysis.zip"));
  }
  await fs.writeFile(
    path.join(dir, "motion.json"),
    JSON.stringify({ schema: "qh-motion/1", rig, clip }, null, 2),
  );
  if (format === "json") return path.join(dir, "motion.json");
  const images = await loadAssets(rig),
    canvas = createCanvas(...rig.canvas),
    ctx = canvas.getContext("2d"),
    count = Math.round(clip.duration * clip.fps);
  const frames = path.join(dir, "frames");
  await fs.mkdir(frames, { recursive: true });
  for (let f = 0; f < count; f++) {
    drawRig(ctx, rig, clip, f / clip.fps, images, { createCanvas });
    await fs.writeFile(
      path.join(frames, `${String(f).padStart(4, "0")}.png`),
      canvas.toBuffer("image/png"),
    );
  }
  if (format === "frames") return frames;
  const dest = path.join(dir, `motion.${format}`);
  const input = [
    "-y",
    "-framerate",
    String(clip.fps),
    "-i",
    path.join(frames, "%04d.png"),
  ];
  if (format === "gif")
    await ffmpeg([
      ...input,
      "-filter_complex",
      "split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=alpha_threshold=128",
      "-loop",
      "0",
      dest,
    ]);
  else
    await ffmpeg([
      ...input,
      "-f",
      "lavfi",
      "-i",
      `color=c=white:s=${rig.canvas.join("x")}:r=${clip.fps}:d=${clip.duration}`,
      "-filter_complex",
      "[1:v][0:v]overlay=shortest=1,format=yuv420p",
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-t",
      String(clip.duration),
      dest,
    ]);
  return dest;
}
