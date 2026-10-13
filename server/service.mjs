import{createBundle}from'./bundle.mjs';
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID,createHash } from "node:crypto";
import { loadImage } from "@napi-rs/canvas";
import { project, saveProject, put, get, list } from "./store.mjs";
import { makeMotion } from "../core/motions.mjs";
import { validateRig, validateClip } from "../core/engine.mjs";
import { repair, exportMotion, assess } from "./render.mjs";
import {readSkeleton} from "./skeleton.mjs";
import {readContext} from "./workflow.mjs";
import { PUBLIC, safeId } from "./paths.mjs";
export function checkedSave(id, body, revision) {
  const errors = validateRig(body.rig);
  for (const c of body.clips || []) errors.push(...validateClip(body.rig, c));
  if (body.rig.id !== id || !body.clips?.some((c) => c.id === body.selected))
    errors.push("Character/selected clip mismatch");
  if (errors.length) throw Error(errors.join("; "));
  return saveProject(id, body, revision);
}
export async function generate(
  id,
  name,
  fps = 24,
  candidates = 2,
  target = 95,
) {
  const p = project(id);
  name = name === "hi" ? "hello" : name;
  if (!Number.isFinite(target) || target < 95 || target > 100)
    throw Error("Target must be 95–100");
  if (![24, 30, 60].includes(fps) || ![1, 2].includes(candidates))
    throw Error("FPS 24/30/60; candidates 1/2");
  const results = [];
  for (const candidate of ["a", "b"].slice(0, candidates)) {
    const motion = makeMotion(p.rig, name, fps, candidate);
    motion.id = `${name}-${Date.now().toString(36)}-${candidate}`;
    const errors=validateClip(p.rig,motion);if(errors.length)throw Error(errors.join("; "));
    results.push(await repair(p.rig, motion, target, 3));
  }
  const candidatesOut = results.map((r) => r.clip);
  const best = [...candidatesOut].sort((a, b) => b.score - a.score)[0];
  const next = {
    ...p,
    clips: [
      ...p.clips.filter((c) => !candidatesOut.some((n) => n.id === c.id)),
      ...candidatesOut,
    ],
    selected: best.id,
  };
  const saved = checkedSave(id, next, p.revision);
  const job = {
    id: randomUUID(),
    character: id,
    motion: name,
    fps,
    target,
    status: results.every((r) => r.status === "accepted")
      ? "accepted"
      : "needs-art-review",
    best: best.id,
    results,
    createdAt: new Date().toISOString(),
  };
  put("job", job.id, job);
  return { project: saved, job };
}
export function prepareGeneration(character, motion, fps = 24) {
  safeId(character);
  if (![24, 30, 60].includes(fps)) throw Error("FPS must be 24,30,60");
  const p = project(character);
  const id = randomUUID();
  return put("job", id, {
    id,
    character,
    motion,
    fps,
    status: "awaiting-generated-art",
    prompt: `Create transparent raster replacement parts for ${p.rig.name}, action ${motion}. Preserve the source identity and palette. Supply clean overlap art at joints, no labels or backgrounds. Use the existing rig's declared canvas, local pivots and body scale; do not normalize by full alpha bounds. Return PNG assets and the qh-rig/1 manifest. Frames at ${fps} fps are rendered locally after import.`,
    contract: {
      skeleton:readSkeleton(character),
      canvas: p.rig.canvas,
      origin: p.rig.origin,
      parts: p.rig.parts.map(({ id, pivot, position, size, parent }) => ({
        id,
        pivot,
        position,
        size,
        parent,
      })),
    },
    createdAt: new Date().toISOString(),
  });
}
export async function importAsset(character, assetName, base64) {
  safeId(character);
  safeId(assetName);
  if (typeof base64 !== "string" || base64.length > 12_000_000)
    throw Error("PNG <= 8 MiB");
  const data = Buffer.from(base64, "base64");
  if (data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
    throw Error("PNG required");
  const image = await loadImage(data);
  if (image.width > 4096 || image.height > 4096)
    throw Error("PNG dimensions exceed 4096");
  const digest=createHash("sha256").update(data).digest("hex");
  const filename=`${assetName}-${digest}.png`;
  const file = path.join(
    PUBLIC,
    "animations",
    character,
    "parts",
    filename,
  );
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
  return {
    asset: `/animations/${character}/parts/${filename}`,
    sha256:digest,
    width: image.width,
    height: image.height,
  };
}
export async function saveNewCharacter(rig) {
  const errors = validateRig(rig);
  if (errors.length) throw Error(errors.join("; "));
  safeId(rig.id);
  if (list("project").some((p) => p.rig.id === rig.id))
    throw Error("Character already exists");
  await fs.mkdir(path.join(PUBLIC, "animations", rig.id), { recursive: true });
  await fs.writeFile(
    path.join(PUBLIC, "animations", rig.id, "rig.json"),
    JSON.stringify(rig, null, 2),
  );
  return project(rig.id);
}
export async function quality(character, clipId) {
  const p = project(character),
    c = p.clips.find((c) => c.id === clipId);
  if (!c) throw Error("Motion not found");
  return assess(p.rig, c);
}
export async function exportClip(character, clipId, format) {
  if(format==="bundle")return createBundle(character);
  const p = project(character),
    c = p.clips.find((c) => c.id === clipId);
  if (!c) throw Error("Motion not found");
  return exportMotion(p.rig, c, format,{skeleton:readSkeleton(character),context:readContext(character)});
}

export async function createCustomMotion(character,clip,revision) {
 const p=project(character);if(p.revision!==revision)throw Error("Project revision changed");
 const errors=validateClip(p.rig,clip);if(errors.length)throw Error(errors.join("; "));
 const candidate={...structuredClone(clip),id:`custom-${randomUUID()}`};
 const report=await assess(p.rig,candidate);
 candidate.quality=report;candidate.score=report.score;
 return {project:checkedSave(character,{...p,clips:[...p.clips,candidate],selected:candidate.id},revision),report,
 scope:"Agent-authored motion tracks; technical validation does not prove gesture or identity quality."};
}
