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
            motion: "hello",
            fps: 30,
            candidates: 2,
            target: 100,
          },
        })
      ).content[0].text,
    );
    assert.equal(gen.job.results.length, 2);
    assert.equal(gen.project.clips.length, 7);
    assert.notEqual(gen.project.selected, "hello-a");
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
  } finally {
    await client.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
});
