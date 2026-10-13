import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "qh-test-"));
process.env.QH_DATA_DIR = temp;
process.env.QH_STORAGE = "json";
const { project,put } = await import("../server/store.mjs");
const { checkedSave, generate, quality, prepareGeneration } = await import(
  "../server/service.mjs"
);
const { assess, repair, exportMotion } = await import("../server/render.mjs");
test("revision conflict preserves agent/user edits", () => {
  const p = project("fox");
  const saved = checkedSave("fox", p, p.revision);
  assert.equal(saved.revision, p.revision + 1);
  assert.throws(() => checkedSave("fox", p, p.revision), /changed elsewhere/);
});
test("generation prompt explicitly awaits image assets", () => {
  const j = prepareGeneration("fox", "point", 30);
  assert.equal(j.status, "awaiting-generated-art");
  assert.equal(j.contract.origin[0], 256);
  assert.throws(() => prepareGeneration("fox", "hello", 12), /FPS/);
});
test("quality rejects detached hand and does not endlessly regenerate", async () => {
  const p = project("fox"),
    c = structuredClone(p.clips[0]);
  c.tracks.push({
    part: "hand_right",
    property: "x",
    keys: [
      { time: 0, value: 150 },
      { time: c.duration, value: 150 },
    ],
  });
  const q = await assess(p.rig, c);
  assert.equal(q.accepted, false);
  assert.ok(q.metrics.connectedBodyRatio < 0.995);
  const r = await repair(p.rig, c, 95, 1);
  assert.equal(r.history.length, 2);
  assert.equal(r.status, "needs-art-review");
});
test("quality detects entirely off-canvas parts", async () => {
  const p = project("fox"),
    c = structuredClone(p.clips[0]);
  c.tracks.push({
    part: "hand_right",
    property: "x",
    keys: [
      { time: 0, value: 2000 },
      { time: c.duration, value: 2000 },
    ],
  });
  const q = await assess(p.rig, c);
  assert.ok(q.metrics.offCanvasSamples > 0);
  assert.equal(q.accepted, false);
});
test("json export retains bind pose and tracks", async () => {
  const p = project("fox"),
    c = p.clips[0];
  const file = await exportMotion(p.rig, c, "json");
  const doc = JSON.parse(await fs.readFile(file));
  assert.equal(doc.schema, "qh-motion/1");
  assert.deepEqual(doc.rig.origin, [256, 256]);
  assert.equal(doc.clip.fps, 24);
});
test.after(async () => {
  await fs.rm(temp, { recursive: true, force: true });
});
test("analysis export preserves numeric fields in a self-contained ZIP", async () => {
  const p = project("fox"),
    file = await exportMotion(p.rig, p.clips[0], "analysis"),
    b = await fs.readFile(file);
  assert.equal(b.readUInt32LE(0), 0x04034b50);
  assert.ok(b.includes(Buffer.from("visible-part-ids.u16")));
  assert.ok(b.includes(Buffer.from("qh-analysis/1")));
  assert.ok(b.includes(Buffer.from("authored ordinal z")));
});

test("invalid generated templates cannot corrupt the saved project",async()=>{
 const p=structuredClone(project("fox"));p.rig.id="template-probe";p.rig.allowedActions=["broken"];p.rig.motionTemplates={broken:{duration:1,tracks:[{part:"missing",property:"rotation",keys:[{time:0,value:0}]}]}};
 put("project","template-probe",p);
 await assert.rejects(()=>generate("template-probe","broken",24,1,95),/unknown part/i);
 assert.equal(project("template-probe").clips.length,p.clips.length);
});
