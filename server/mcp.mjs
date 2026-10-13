import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { project, list, get } from "./store.mjs";
import {
  generate,
  quality,
  exportClip,
  checkedSave,
  prepareGeneration,
  importAsset,
  saveNewCharacter,
} from "./service.mjs";
const server = new McpServer({ name: "qh-motion-studio", version: "0.1.0" });
const text = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});
const wrap = (fn) => async (args) => {
  try {
    return text(await fn(args));
  } catch (e) {
    return { ...text({ error: e.message }), isError: true };
  }
};
server.registerTool(
  "get_project",
  {
    description: "Read the persistent numeric rig, parts and motion timelines.",
    inputSchema: { character: z.string() },
  },
  wrap((a) => project(a.character)),
);
server.registerTool(
  "save_project",
  {
    description:
      "Save validated rig/timeline edits. Use the last read revision to prevent overwriting another editor.",
    inputSchema: {
      character: z.string(),
      revision: z.number().int(),
      project: z.any(),
    },
  },
  wrap((a) => checkedSave(a.character, a.project, a.revision)),
);
server.registerTool(
  "generate_motion",
  {
    description:
      "Render motion from existing local raster parts. Supported actions hello/hi, thinking, success, idle. Creates two candidates and runs bounded numeric repair. New artwork requires prepare_image_job and import_png.",
    inputSchema: {
      character: z.string(),
      motion: z.string(),
      fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).default(24),
      candidates: z.union([z.literal(1), z.literal(2)]).default(2),
      target: z.number().min(95).max(100).default(95),
    },
  },
  wrap((a) => generate(a.character, a.motion, a.fps, a.candidates, a.target)),
);
server.registerTool(
  "prepare_image_job",
  {
    description:
      "Prepare an image generation prompt and bind-pose contract. Returns awaiting-generated-art; no image model is bundled. The agent uses its available image tool then import_png.",
    inputSchema: {
      character: z.string(),
      motion: z.string(),
      fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).default(24),
    },
  },
  wrap((a) => prepareGeneration(a.character, a.motion, a.fps)),
);
server.registerTool(
  "import_png",
  {
    description:
      "Store a generated transparent PNG in the local animations folder. Register it in rig.assets and a part/replacement track with save_project.",
    inputSchema: {
      character: z.string(),
      name: z.string(),
      base64: z.string(),
    },
  },
  wrap((a) => importAsset(a.character, a.name, a.base64)),
);
server.registerTool(
  "add_character",
  {
    description:
      "Create a character from a validated rig manifest after importing its PNG assets.",
    inputSchema: { rig: z.any() },
  },
  wrap((a) => saveNewCharacter(a.rig)),
);
server.registerTool(
  "check_motion",
  {
    description:
      "Measure attachment coverage, clipping, contacts, loop and limits; quality is technical, artistic quality needs visual review.",
    inputSchema: { character: z.string(), clip: z.string() },
  },
  wrap((a) => quality(a.character, a.clip)),
);
server.registerTool(
  "export_motion",
  {
    description:
      "Export deterministic JSON, transparent PNG frames, GIF or MP4 (FFmpeg required). Returns a local path.",
    inputSchema: {
      character: z.string(),
      clip: z.string(),
      format: z.enum(["json", "gif", "mp4", "frames", "analysis"]),
    },
  },
  wrap(async (a) => ({
    file: await exportClip(a.character, a.clip, a.format),
  })),
);
server.registerTool(
  "list_jobs",
  {
    description:
      "Read generation/repair outcomes and measured quality history.",
    inputSchema: {},
  },
  wrap(() => list("job")),
);
server.registerTool(
  "list_revisions",
  {
    description: "Read saved project revisions for recovery or comparison.",
    inputSchema: { character: z.string() },
  },
  wrap((a) => list("revision").filter((p) => p.rig.id === a.character)),
);
await server.connect(new StdioServerTransport());
