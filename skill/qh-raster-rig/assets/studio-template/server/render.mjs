import { zipDirectory } from "./zip.mjs";
import { exportAnalysis } from "./analysis-export.mjs";
import { connectedCoverage } from "../core/analysis.mjs";
import { meshMetrics, vertices, drawMesh } from "../core/mesh.mjs";
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
function activeInterval(contract, time, duration) {
  const intervals = contract.activeIntervals ?? [[0, duration]];
  return intervals.find(([start, end]) => time >= start && time <= end);
}
function contractErrors(rig, clip) {
  const errors = [], intervals = (c) => {
    if (c.activeIntervals !== undefined && (!Array.isArray(c.activeIntervals) || c.activeIntervals.some((v) =>
      !Array.isArray(v) || v.length !== 2 || v.some((n) => !Number.isFinite(n)) || v[0] < 0 || v[1] < v[0] || v[1] > clip.duration)))
      errors.push("Invalid active intervals");
  };
  if(rig.motionPolicy?.maxJointVelocityPxPerSecond !== undefined && (!Number.isFinite(rig.motionPolicy.maxJointVelocityPxPerSecond) || rig.motionPolicy.maxJointVelocityPxPerSecond <= 0)) errors.push("Invalid maximum joint velocity");
  for (const p of rig.parts) if (p.attachment) {
    const c = p.attachment, radius = c.radiusPx ?? c.radius ?? 3;
    if (typeof c.required !== "boolean" || !Number.isFinite(radius) || radius < 1 || radius > 64 ||
      (c.minOverlap !== undefined && (!Number.isInteger(c.minOverlap) || c.minOverlap < 1)) ||
      (c.alphaThreshold !== undefined && (!Number.isFinite(c.alphaThreshold) || c.alphaThreshold < 0 || c.alphaThreshold > 254)))
      errors.push(`${p.id}: invalid attachment contract`);
    intervals(c);
  }
  for (const c of clip.contacts ?? rig.contacts ?? []) {
    if (!rig.parts.some((p) => p.id === c.part) || !Array.isArray(c.point) || c.point.length !== 2 || c.point.some((v) => !Number.isFinite(v)) ||
      (c.target !== undefined && (!Array.isArray(c.target) || c.target.length !== 2 || c.target.some((v) => !Number.isFinite(v)))) ||
      (c.referenceTime !== undefined && (!Number.isFinite(c.referenceTime) || c.referenceTime < 0 || c.referenceTime > clip.duration)) ||
      (c.tolerancePx !== undefined && (!Number.isFinite(c.tolerancePx) || c.tolerancePx < 0))) errors.push("Invalid contact contract");
    intervals(c);
  }
  return errors;
}
function jointOverlap(child, parent, images, contract) {
  const radius = contract.radiusPx ?? contract.radius ?? 3, half = Math.ceil(radius) + 2, size = 2 * half + 1;
  const masks = [child, parent].map((p) => {
    const canvas = createCanvas(size, size), ctx = canvas.getContext("2d");
    ctx.translate(half - child.joint[0], half - child.joint[1]);
    ctx.transform(...p.matrix); ctx.globalAlpha = p.opacity;
    if (p.mesh) drawMesh(ctx, images[p.asset], p, p.bend, createCanvas);
    else ctx.drawImage(images[p.asset], 0, 0, ...p.size);
    return ctx.getImageData(0, 0, size, size).data;
  });
  let overlap = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4 + 3;
    if (Math.hypot(x - half, y - half) <= radius && masks.every((m) => m[i] > (contract.alphaThreshold ?? 80))) overlap++;
  }
  return overlap;
}
// Render actual alpha beyond the viewport. Transparent asset padding is not
// clipping, and opaque pixels already outside the edge cannot hide from this gate.
function alphaClipping(rig, clip, time, images, states) {
  let minX = 0, minY = 0, maxX = rig.canvas[0], maxY = rig.canvas[1];
  for (const p of states.filter((p) => p.visible && p.opacity > 0)) {
    const corners = p.mesh ? vertices(p, p.bend).map((v) => v.target) : [[0,0],[p.size[0],0],[0,p.size[1]],p.size];
    for (const v of corners.map((v) => point(p.matrix, v))) {
      minX = Math.min(minX, v[0]); minY = Math.min(minY, v[1]); maxX = Math.max(maxX, v[0]); maxY = Math.max(maxY, v[1]);
    }
  }
  minX = Math.floor(minX) - 2; minY = Math.floor(minY) - 2; maxX = Math.ceil(maxX) + 2; maxY = Math.ceil(maxY) + 2;
  const w = maxX - minX, h = maxY - minY;
  // Fail closed rather than allocate unbounded buffers for extreme transforms.
  if (w > 8192 || h > 8192 || w * h > 16000000) return { outside: 0, total: 0, inconclusive: true };
  const canvas = createCanvas(w, h), ctx = canvas.getContext("2d"); ctx.translate(-minX, -minY);
  drawRig(ctx, rig, clip, time, images, { createCanvas });
  const data = ctx.getImageData(0, 0, w, h).data;
  let outside = 0, total = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 0) {
    total++;
    if (x + minX < 0 || y + minY < 0 || x + minX >= rig.canvas[0] || y + minY >= rig.canvas[1]) outside++;
  }
  return { outside, total, inconclusive: false };
}
export async function assess(rig, clip) {
  const errors = [...validateRig(rig), ...validateClip(rig, clip)];
  if (!errors.length) errors.push(...contractErrors(rig, clip));
  if (errors.length) return { score: 0, accepted: false, errors };
  const images = await loadAssets(rig);
  const canvas = createCanvas(...rig.canvas),
    ctx = canvas.getContext("2d");
  const count = Math.max(2, Math.ceil(clip.duration * clip.fps) + 1);
  const times = [...new Set([
    ...Array.from({length: count}, (_, i) => i * clip.duration / (count - 1)),
    ...clip.tracks.flatMap((track) => track.keys.map((key) => key.time)),
    ...(clip.contacts ?? rig.contacts ?? []).flatMap((c) => (c.activeIntervals ?? []).flat()),
  ])].sort((a, b) => a - b);
  let clipped = 0,
    total = 0,
    contact = 0,
    limit = 0,
    maxStep = 0,
    maxVelocity = 0,
    maxGap = 0,
    minConnected = 1,
    flips = 0,
    offCanvas = 0,
    clippingInconclusive = 0,
    contactViolations = 0,
    checkedAttachments = 0;
  let previous = null, previousTime = null;
  const sampled = [];
  for (let f = 0; f < times.length; f++) {
    const t = times[f],
      s = stateAt(rig, clip, t);
    drawRig(ctx, rig, clip, t, images, { createCanvas });
    const a = ctx.getImageData(0, 0, ...rig.canvas).data;
    const clipping = alphaClipping(rig, clip, t, images, s);
    total += clipping.total; clipped += clipping.outside;
    if (clipping.inconclusive) clippingInconclusive++;
    const coverage = connectedCoverage(
      Uint8Array.from({ length: rig.canvas[0] * rig.canvas[1] }, (_, i) =>
        a[i * 4 + 3] > 128 ? 1 : 0,
      ),
      ...rig.canvas,
    );
    if (rig.mode !== "poses" && rig.connectivity?.required !== false)
      minConnected = Math.min(minConnected, coverage.ratio);
    for (const c of clip.contacts ?? rig.contacts ?? []) {
      const interval = activeInterval(c, t, clip.duration);
      if (!interval) continue;
      const p = s.find((p) => p.id === c.part);
      if (!p.visible || p.opacity <= 0) continue;
      const rest = stateAt(rig, clip, c.referenceTime ?? interval[0]).find((p) => p.id === c.part);
      const target = c.target ?? point(rest.matrix, c.point);
      const drift = Math.hypot(...point(p.matrix, c.point).map((n, i) => n - target[i]));
      contact = Math.max(contact, drift);
      contactViolations = Math.max(contactViolations, Math.max(0, drift - (c.tolerancePx ?? .5)));
    }
    for (const p of s) {
      if (p.visible && p.opacity > 0) {
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
      if (p.parent && p.attachment?.required && p.visible && p.opacity > 0 && activeInterval(p.attachment, t, clip.duration)) {
        const parent = s.find((x) => x.id === p.parent);
        checkedAttachments++;
        if (!parent.visible || parent.opacity <= 0 || jointOverlap(p, parent, images, p.attachment) < (p.attachment.minOverlap ?? 1)) maxGap++;
      }
      if (previous) {
        const prev = previous.find((x) => x.id === p.id);
        const distance = Math.hypot(p.joint[0] - prev.joint[0], p.joint[1] - prev.joint[1]);
        maxStep = Math.max(maxStep, distance);
        maxVelocity = Math.max(maxVelocity, distance / (t - previousTime));
      }
    }
    previous = s; previousTime = t;
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
  const maxAllowedVelocity=rig.motionPolicy?.maxJointVelocityPxPerSecond ?? 432;
  const penalties = {
    disconnection: Math.min(30, (1 - minConnected) * 200),
    meshFlips: Math.min(30, flips),
    offCanvas: Math.min(30, offCanvas * 5),
    clipping: Math.min(25, (clipped / Math.max(1, total)) * 10000),
    contact: Math.min(25, contactViolations * 2),
    limits: Math.min(20, limit),
    jointGaps: Math.min(30, maxGap * 2),
    loop: clip.loop === false ? 0 : Math.min(20, loop * 2),
    speed: Math.max(
      0,
      Math.min(15, (maxVelocity - maxAllowedVelocity) / (maxAllowedVelocity / 7.2)),
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
      contactViolations === 0 &&
      clipped === 0 &&
      clippingInconclusive === 0 &&
      limit === 0 &&
      minConnected >= 0.995 &&
      flips === 0 &&
      offCanvas === 0,
    metrics: {
      connectedBodyRatio: minConnected,
      flippedTriangles: flips,
      offCanvasSamples: offCanvas,
      contactDriftPx: contact,
      contactViolationPx: contactViolations,
      checkedAttachmentSamples: checkedAttachments,
      clippingInconclusiveSamples: clippingInconclusive,
      outsideAlphaPixels: clipped,
      loopMatrixError: loop,
      jointGapSamples: maxGap,
      edgePixels: clipped,
      maxJointStepPx: maxStep,
      maxJointVelocityPxPerSecond: maxVelocity,
      maxAllowedVelocityPxPerSecond:maxAllowedVelocity,
      limitOverrunDeg: limit,
    },
    penalties,
    sampled,
    scope:
      "Actual alpha clipping on padded canvases, declared pair-overlap attachments and active contact intervals, mesh/limits/speed/loop. Global connected-body ratio is a heuristic unless connectivity.required=false; undeclared attachment intent, artistic naturalness and identity are not proven. Extreme padded extents fail closed as inconclusive.",
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
    if (q.metrics?.maxJointVelocityPxPerSecond > q.metrics.maxAllowedVelocityPxPerSecond) {
      const ratio = Math.min(2, q.metrics.maxJointVelocityPxPerSecond / (q.metrics.maxAllowedVelocityPxPerSecond * .9259259259));
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
      const declared = (clip.contacts ?? rig.contacts ?? []).filter((c) => c.part === t.part && c.repair === "lock-local");
      if (declared.length && ["x", "y", "rotation", "scaleX", "scaleY"].includes(t.property)) {
        for (const c of declared) for (const interval of c.activeIntervals ?? [[0, current.duration]]) {
          const reference = stateAt(rig, clip, c.referenceTime ?? interval[0]).find((p) => p.id === c.part);
          const value = reference[t.property];
          t.keys = t.keys.map((k) => k.time >= interval[0] && k.time <= interval[1] ? {...k, value} : k);
          for (const time of interval) if (!t.keys.some((k) => k.time === time)) t.keys.push({ time, value, ease: "linear" });
          t.keys.sort((a, b) => a.time - b.time);
        }
      }
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
export async function exportMotion(rig, clip, format = "json", metadata = {}) {
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
    if(metadata.skeleton)await fs.writeFile(path.join(folder,"skeleton.json"),JSON.stringify(metadata.skeleton,null,2));
    if(metadata.context)await fs.writeFile(path.join(folder,"agent-context.json"),JSON.stringify(metadata.context,null,2));
    return zipDirectory(folder, path.join(dir, "analysis.zip"));
  }
  await fs.writeFile(
    path.join(dir, "motion.json"),
    JSON.stringify({ schema: "qh-motion/1", rig, clip, ...metadata }, null, 2),
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
