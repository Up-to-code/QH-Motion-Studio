import {createBundle,importBundle} from './bundle.mjs';
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, PUBLIC, LOCAL, safeId } from "./paths.mjs";
import { project, list, storage } from "./store.mjs";
import {
  checkedSave,
  generate,
  prepareGeneration,
  importAsset,
  saveNewCharacter,
  quality,
  exportClip,
} from "./service.mjs";
import {readSkeleton,saveSkeleton,checkSkeleton} from "./skeleton.mjs";
import {readContext,saveContext,beginWorkflow,readWorkflow,regionalPacket,evaluatePatch,recordReview,repairWorkflow,readCandidate} from "./workflow.mjs";
const origins = new Set([
  "http://127.0.0.1:8090",
  "http://localhost:8090",
  "http://127.0.0.1:8091",
  "http://localhost:8091",
]);
const json = (res, data, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};
async function body(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 90_000_000) throw Error("Request too large");
  }
  return text ? JSON.parse(text) : {};
}
const mime = {
  ".png": "image/png",
  ".json": "application/json",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".zip": "application/zip",
  ".qhmotion": "application/vnd.qh.motion+json",
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};
export const server = http.createServer(async (req, res) => {
  try {
    const origin = req.headers.origin;
    if (origin && !origins.has(origin))
      return json(res, { error: "Origin denied" }, 403);
    const host = req.headers.host?.split(":")[0];
    if (!["localhost", "127.0.0.1"].includes(host))
      return json(res, { error: "Host denied" }, 403);
    const url = new URL(req.url, "http://127.0.0.1:8091");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "api") {
      if(parts[1]==="bundle"&&req.method==="POST") {const b=await body(req);if(parts[2]==="import")return json(res,await importBundle(b.bundle,b.character));const file=await createBundle(b.character);return json(res,{url:"/api/download?file="+encodeURIComponent(path.relative(LOCAL,file)),filename:path.basename(file)});}
      if (parts[1] === "characters" && req.method === "GET") {
        for (const id of ["fox", "hero1", "nia", "orbit"]) project(id);
        return json(res, {
          characters: list("project").map((p) => ({
            id: p.rig.id,
            name: p.rig.name,
            mode: p.rig.mode,
          })),
          storage,
          mcp:{command:process.execPath,args:[path.join(ROOT,"server/mcp.mjs")],cwd:ROOT},
        });
      }
      if (parts[1] === "characters" && req.method === "POST")
        return json(res, await saveNewCharacter(await body(req)));
      if(parts[1] === "candidate" && req.method === "GET")return json(res,readCandidate(parts[2]));
      if(parts[1] === "context") {
        const id=safeId(parts[2]);
        if(req.method === "GET")return json(res,readContext(id));
        if(req.method === "PUT"){const b=await body(req);return json(res,saveContext(id,b.context,b.revision));}
        return json(res,{error:"GET or PUT required"},405);
      }
      if(parts[1] === "workflow") {
        if(req.method === "POST"){
          const b=await body(req);
          if(parts[3]==="repair")return json(res,await repairWorkflow(parts[2],b.attempts));
          if(parts[3]==="patch")return json(res,await evaluatePatch(parts[2],b.candidate,b.options));
          if(parts[3]==="review")return json(res,recordReview(parts[2],b));
          return json(res,await beginWorkflow(b.character,b.clip,b.settings));
        }
        if(req.method === "GET")return json(res,parts[3]?await regionalPacket(parts[2],parts[3],url.searchParams.has("time")?Number(url.searchParams.get("time")):undefined):readWorkflow(parts[2]));
        return json(res,{error:"GET or POST required"},405);
      }
      if (parts[1] === "skeleton") {
        const id=safeId(parts[2]);
        if(req.method === "GET") return json(res,readSkeleton(id));
        if(req.method === "PUT") {const b=await body(req);return json(res,saveSkeleton(id,b.skeleton,b.revision));}
        if(req.method === "POST") {const b=await body(req);return json(res,checkSkeleton(id,b.clip));}
        return json(res,{error:"GET, PUT or POST required"},405);
      }
      if (parts[1] === "jobs") return json(res, list("job"));
      if (parts[1] === "project") {
        const id = safeId(parts[2]);
        if (req.method === "GET") return json(res, project(id));
        const b = await body(req);
        if (req.method === "PUT")
          return json(res, checkedSave(id, b.project, b.revision));
      }
      if (
        ["generate", "prepare", "asset", "quality", "export"].includes(
          parts[1],
        ) &&
        req.method !== "POST"
      )
        return json(res, { error: "POST required" }, 405);
      if (parts[1] === "generate") {
        const b = await body(req);
        return json(
          res,
          await generate(b.character, b.motion, b.fps, b.candidates, b.target),
        );
      }
      if (parts[1] === "prepare") {
        const b = await body(req);
        return json(res, prepareGeneration(b.character, b.motion, b.fps));
      }
      if (parts[1] === "asset") {
        const b = await body(req);
        return json(res, await importAsset(b.character, b.name, b.base64));
      }
      if (parts[1] === "quality") {
        const b = await body(req);
        return json(res, await quality(b.character, b.clip));
      }
      if (parts[1] === "export") {
        const b = await body(req);
        const file = await exportClip(b.character, b.clip, b.format);
        return json(res, {
          url:
            "/api/download?file=" +
            encodeURIComponent(path.relative(LOCAL, file)),
          filename: path.basename(file),
        });
      }
      if (parts[1] === "download") {
        const file = path.resolve(LOCAL, url.searchParams.get("file") || "");
        if (!file.startsWith(path.join(LOCAL, "exports") + path.sep))
          throw Error("Invalid download");
        const stat = await fs.stat(file);
        if (!stat.isFile())
          throw Error("Export format is a folder; use CLI for frame sequences");
        res.writeHead(200, {
          "Content-Type":
            mime[path.extname(file)] || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${path.basename(file)}"`,
        });
        return res.end(await fs.readFile(file));
      }
      return json(res, { error: "Unknown endpoint" }, 404);
    }
    const base = url.pathname.startsWith("/animations/")
      ? PUBLIC
      : path.join(ROOT, "dist");
    let file = path.resolve(base, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(base + path.sep)) throw Error("Invalid path");
    try {
      if (!(await fs.stat(file)).isFile()) throw Error();
    } catch {
      if (base === PUBLIC) return json(res, { error: "Asset not found" }, 404);
      file = path.join(base, "index.html");
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
    });
    res.end(await fs.readFile(file));
  } catch (e) {
    json(res, { error: e.message }, e.status || 400);
  }
});
if (process.argv[1] === fileURLToPath(import.meta.url))
  server.listen(8091, "127.0.0.1", () =>
    console.log("QH Studio: http://127.0.0.1:8091"),
  );
