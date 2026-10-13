import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
test("MCP host can inspect, prepare images, generate two candidates and export", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "qh-mcp-")),
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve("server/mcp.mjs")],
      env: { ...process.env, QH_DATA_DIR: temp, QH_STORAGE: "json" },
      stderr: "pipe",
    }),
    client = new Client({ name: "qh-integration-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const listing = await client.listTools();
    assert.ok(listing.tools.some((t) => t.name === "generate_motion"));
    const get = await client.callTool({
      name: "get_project",
      arguments: { character: "fox" },
    });
    const p = JSON.parse(get.content[0].text);
    assert.equal(p.rig.parts.length, 33);
    const prep = JSON.parse(
      (
        await client.callTool({
          name: "prepare_image_job",
          arguments: { character: "fox", motion: "point", fps: 24 },
        })
      ).content[0].text,
    );
    assert.equal(prep.status, "awaiting-generated-art");
    const gen = JSON.parse(
      (
        await client.callTool({
          name: "generate_motion",
          arguments: {
            character: "fox",
            motion: "ready",
            fps: 30,
            candidates: 2,
            target: 100,
          },
        })
      ).content[0].text,
    );
    assert.equal(gen.job.results.length, 2);
    assert.equal(gen.project.clips.length, 3);
    assert.notEqual(gen.project.selected, "ready-a");
    const exp = JSON.parse(
      (
        await client.callTool({
          name: "export_motion",
          arguments: {
            character: "fox",
            clip: gen.project.selected,
            format: "json",
          },
        })
      ).content[0].text,
    );
    assert.ok((await fs.stat(exp.file)).size > 0);
    const bundleExport=await client.callTool({name:"export_qh_bundle",arguments:{character:"fox"}});assert(!bundleExport.isError);const bundle=JSON.parse(await fs.readFile(JSON.parse(bundleExport.content[0].text).file,"utf8"));const importedId="mcp-bundle-"+Date.now();try{const imported=await client.callTool({name:"import_qh_bundle",arguments:{bundle,character:importedId}});assert(!imported.isError,imported.content[0].text.slice(0,200));assert.equal(JSON.parse(imported.content[0].text).rig.id,importedId);}finally{await fs.rm(path.join("public/animations",importedId),{recursive:true,force:true});}

  } finally {
    await client.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
});
test('MCP exposes skeleton-first memory and resumable specialist region workflow',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'qh-mcp-workflow-'));
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('server/mcp.mjs')],env:{...process.env,QH_DATA_DIR:temp,QH_STORAGE:'json'},stderr:'pipe'});
 const client=new Client({name:'qh-workflow-test',version:'1.0.0'});
 const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});assert(!r.isError,JSON.stringify(r));return {...JSON.parse(r.content[0].text),nativeImage:r.content.find(c=>c.type==="image")};};
 try{
  await client.connect(transport);
  const s=await call('get_skeleton',{character:'fox'});assert.equal(s.skeleton.nodes.length,35);
  const c=await call('get_character_context',{character:'fox'});
  await call('save_character_context',{character:'fox',revision:c.revision,context:{plan:'Skeleton and local sleeve review first'}});
  const p=await call('get_project',{character:'fox'});
  const w=await call('inspect_regions',{character:'fox',clip:p.clips[0].id,settings:{samples:2,tileSize:64,halo:4}});
  const a=await call('claim_inspection_region',{workflow:w.id,agent:'reviewer-a',role:'ownership-review'});
  const b=await call('claim_inspection_region',{workflow:w.id,agent:'reviewer-b',role:'ownership-review'});assert.notEqual(a.tile,b.tile);
  const region=await call('get_inspection_region',{workflow:w.id,tile:a.tile});assert.equal(region.nativeImage.mimeType,'image/png');assert(region.nativeImage.data.length>0);
  await call('submit_region_review',{workflow:w.id,task:a.id,agent:'reviewer-a',report:{passed:true,note:'Local ownership region reviewed'}});
  const resumed=await call('resume_inspection',{workflow:w.id});assert.equal(resumed.assignments[0].status,'reviewed');
 }finally{await client.close();}
});
