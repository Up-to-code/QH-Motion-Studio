import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LOCAL, PUBLIC, safeId } from "./paths.mjs";
import { makeMotion } from "../core/motions.mjs";
fs.mkdirSync(LOCAL, { recursive: true });
const jsonMode = process.env.QH_STORAGE === "json";
const db = jsonMode
  ? null
  : new DatabaseSync(path.join(LOCAL, "studio.sqlite"));
db?.exec(
  "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id))",
);
function filepath(kind, id) {
  safeId(kind);
  safeId(id);
  return path.join(LOCAL, `${kind}-${id}.json`);
}
export function get(kind, id) {
  safeId(kind);
  safeId(id);
  if (db) {
    const row = db
      .prepare("SELECT body FROM records WHERE kind=? AND id=?")
      .get(kind, id);
    return row ? JSON.parse(row.body) : null;
  }
  const file = filepath(kind, id);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}
export function put(kind, id, value) {
  safeId(kind);
  safeId(id);
  const body = JSON.stringify(value);
  if (db)
    db.prepare(
      "INSERT INTO records(kind,id,body) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
    ).run(kind, id, body);
  else {
    const file = filepath(kind, id);
    fs.writeFileSync(file + ".tmp", body);
    fs.renameSync(file + ".tmp", file);
  }
  return value;
}
export function list(kind) {
  safeId(kind);
  if (db)
    return db
      .prepare("SELECT body FROM records WHERE kind=?")
      .all(kind)
      .map((r) => JSON.parse(r.body));
  return fs
    .readdirSync(LOCAL)
    .filter((n) => n.startsWith(kind + "-") && n.endsWith(".json"))
    .map((n) => JSON.parse(fs.readFileSync(path.join(LOCAL, n), "utf8")));
}
export function project(id = "fox") {
  safeId(id);
  const saved = get("project", id);
  if (saved) return saved;
  const filename = path.join(PUBLIC, "animations", id, "rig.json");
  if (!fs.existsSync(filename)) throw Error("Character not found");
  const rig = JSON.parse(fs.readFileSync(filename));
  const actions=rig.id === "fox" ? ["hello","thinking","success","idle"] : ["nia","orbit"].includes(rig.id) && rig.mode === "poses" ? ["idle","thinking","success"] : ["idle",...Object.keys(rig.motionTemplates || {}).filter(n=>n!=="idle")];
  const clips = actions.flatMap((name) =>
    name === "hello"
      ? [makeMotion(rig, name, 24, "a"), makeMotion(rig, name, 24, "b")]
      : [makeMotion(rig, name)],
  );
  return put("project", id, { rig, clips, selected: clips[0].id, revision: 0 });
}
export function saveProject(id, body, expected) {
  safeId(id);
  let lock = null;
  try {
    if (db) db.exec("BEGIN IMMEDIATE");
    else lock = fs.openSync(path.join(LOCAL, id + ".lock"), "wx");
    const old = project(id);
    if (expected !== old.revision) {
      const error = Error("Project changed elsewhere; reload before saving.");
      error.status = 409;
      throw error;
    }
    put("revision", `${id}-${old.revision}`, old);
    const next = put("project", id, { ...body, revision: old.revision + 1 });
    if (db) db.exec("COMMIT");
    return next;
  } catch (error) {
    if (db) db.exec("ROLLBACK");
    if (error.code === "EEXIST") {
      error.message =
        "Project is being saved elsewhere; retry after reading the current revision.";
      error.status = 409;
    }
    throw error;
  } finally {
    if (lock !== null) {
      fs.closeSync(lock);
      fs.unlinkSync(path.join(LOCAL, id + ".lock"));
    }
  }
}
export const storage = jsonMode ? "JSON files" : "SQLite";

// Synchronous record mutation, serialized across local MCP/server processes.
let recordTransactionDepth = 0;
const heldJsonLocks = new Set();
export function withRecordLock(kind,id,fn) {
 safeId(kind);safeId(id);
 if(db && recordTransactionDepth) return fn();
 const lockPath=path.join(LOCAL,`${kind}-${id}.lock`);
 if(!db&&heldJsonLocks.has(lockPath))return fn();
 let lock=null,started=false;
 try {
  if(db){db.exec('BEGIN IMMEDIATE');recordTransactionDepth++;started=true;}
  else {lock=fs.openSync(lockPath,'wx');heldJsonLocks.add(lockPath);}
  const result=fn();if(result?.then)throw Error('Record lock callback must be synchronous');
  if(db)db.exec('COMMIT');return result;
 } catch(e) {
  if(db&&started)db.exec('ROLLBACK');
  if(e.code==='EEXIST'){e.status=409;e.message='Record is being edited elsewhere; reload and retry';}
  throw e;
 } finally {
  if(db&&started)recordTransactionDepth--;
  if(lock!==null){fs.closeSync(lock);fs.unlinkSync(lockPath);heldJsonLocks.delete(lockPath);}
 }
}
