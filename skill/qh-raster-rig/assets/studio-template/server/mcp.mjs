import{createBundle,importBundle}from'./bundle.mjs';
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
  createCustomMotion,
} from "./service.mjs";
import {readSkeleton,saveSkeleton,checkSkeleton} from "./skeleton.mjs";
import {readContext,saveContext,beginWorkflow,readWorkflow,regionalPacket,evaluatePatch,recordReview,repairWorkflow,readCandidate,claimRegion,submitRegion} from "./workflow.mjs";
const server = new McpServer({ name: "qh-motion-studio", version: "0.2.0" });
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
server.registerTool("export_qh_bundle",{description:"Export all motions, compiled frame data and checked PNG assets as a portable .qhmotion bundle.",inputSchema:{character:z.string()}},wrap(async a=>({file:await createBundle(a.character)})));
server.registerTool("import_qh_bundle",{description:"Validate checksums, dimensions and frame geometry, then import under a new character ID without replacing existing work.",inputSchema:{bundle:z.any(),character:z.string().optional()}},wrap(a=>importBundle(a.bundle,a.character)));
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
server.registerTool("get_skeleton",{description:"Read the persistent authored joint graph before generating artwork or motion. Draft control anchors are not inferred anatomy.",inputSchema:{character:z.string()}},wrap(a=>readSkeleton(a.character)));
server.registerTool("save_skeleton",{description:"Save confirmed anatomical/control joints, rest anchors and connections with revision protection.",inputSchema:{character:z.string(),revision:z.number().int(),skeleton:z.any()}},wrap(a=>saveSkeleton(a.character,a.skeleton,a.revision)));
server.registerTool("check_skeleton",{description:"Compare saved joint anchors and parent-local bone lengths against a sampled motion. Reports exact canvas-pixel errors.",inputSchema:{character:z.string(),clip:z.string()}},wrap(a=>checkSkeleton(a.character,a.clip)));
server.registerTool("get_character_context",{description:"Read saved identity, appearance, motion intent, decisions, failures and previous results before continuing work.",inputSchema:{character:z.string()}},wrap(a=>readContext(a.character)));
server.registerTool("save_character_context",{description:"Persist agent plans and decisions with context revision protection.",inputSchema:{character:z.string(),revision:z.number().int(),context:z.any()}},wrap(a=>saveContext(a.character,a.context,a.revision)));
server.registerTool("inspect_regions",{description:"Run skeleton, declared attachment overlap, local loop-pixel and technical inspectors; save a resumable workflow. Does not certify anatomy or artistic quality.",inputSchema:{character:z.string(),clip:z.string(),settings:z.any().optional()}},wrap(a=>beginWorkflow(a.character,a.clip,a.settings)));
server.registerTool("get_inspection_region",{description:"Read a region's core/halo, skeleton, memory and evidence for local inspection. Coordinates remain original canvas pixels.",inputSchema:{workflow:z.string(),tile:z.string(),time:z.number().optional()}},async a=>{
 try{
  const packet=await regionalPacket(a.workflow,a.tile,a.time),{image,...metadata}=packet;
  return {content:[...text(metadata).content,{type:"image",mimeType:"image/png",data:image.split(",")[1]}]};
 }catch(e){return {...text({error:e.message}),isError:true};}
});
server.registerTool("resume_inspection",{description:"Read saved inspector tasks and previous results.",inputSchema:{workflow:z.string()}},wrap(a=>readWorkflow(a.workflow)));
server.registerTool("test_motion_patch",{description:"Evaluate a numeric candidate against saved regional errors without overwriting the project. Rejects new category regressions and retains candidate/evidence for review.",inputSchema:{workflow:z.string(),candidate:z.any(),options:z.any()}},wrap(a=>evaluatePatch(a.workflow,a.candidate,a.options)));
server.registerTool("record_inspector_review",{description:"Record local-region visual evidence from a specialist, preserving provenance separately from technical checks.",inputSchema:{workflow:z.string(),role:z.string(),note:z.string(),passed:z.boolean(),regions:z.array(z.string()).default([])}},wrap(a=>recordReview(a.workflow,a)));
server.registerTool("create_custom_motion",{description:"Create a motion for arbitrary authored rigs using numeric tracks after skeleton planning. Preserves prior clips and assesses the new candidate; no Fox-specific presets assumed.",inputSchema:{character:z.string(),revision:z.number().int(),clip:z.any()}},wrap(a=>createCustomMotion(a.character,a.clip,a.revision)));
server.registerTool("repair_inspection",{description:"Run a bounded deterministic repair batch for declared limits/contact/timing defects. Preserve the project and prior candidate; stop with specialist-review-required when no safe numeric fix applies.",inputSchema:{workflow:z.string(),attempts:z.number().int().min(1).max(3).default(3)}},wrap(a=>repairWorkflow(a.workflow,a.attempts)));
server.registerTool("get_motion_candidate",{description:"Read a retained proposed rig/clip after inspection and compare before publishing with save_project.",inputSchema:{candidate:z.string()}},wrap(a=>readCandidate(a.candidate)));
server.registerTool("claim_inspection_region",{description:"Assign the next occupied region to a named specialist. Claims persist so multiple agents do not duplicate local review.",inputSchema:{workflow:z.string(),agent:z.string(),role:z.enum(["artwork-review","ownership-review","motion-review"]).default("artwork-review")}},wrap(a=>claimRegion(a.workflow,a.agent,a.role)));
server.registerTool("submit_region_review",{description:"Submit evidence for the specialist's claimed region. Unknown semantic error categories are retained, not automatically certified by numeric repair.",inputSchema:{workflow:z.string(),task:z.string(),agent:z.string(),report:z.any()}},wrap(a=>submitRegion(a.workflow,a.task,a.agent,a.report)));
await server.connect(new StdioServerTransport());
