# Local agent and embedding interface

The React app is optional. The engine can be imported directly from core/engine.mjs. `stateAt` is deterministic and does not read time, a viewport, or the DOM. Use a canvas adapter only for rendering.

Start studio: pnpm dev (127.0.0.1:8090, local API 8091).
Start MCP: node /absolute/studio/server/mcp.mjs.

Example host configuration:

```json
{"mcpServers":{"qh-motion":{"command":"node","args":["/absolute/studio/server/mcp.mjs"]}}}
```

Tools: get_project, save_project, generate_motion, prepare_image_job, import_png, add_character, check_motion, export_motion, list_jobs. `save_project` requires the revision returned by the last read; conflicts require re-read and intentional merging. MCP stdout is reserved for protocol messages.

Image workflow: prepare_image_job returns a prompt and declared canvas/part contract with awaiting-generated-art. An agent uses its own available image generator, then imports transparent PNGs and updates the manifest. There is no bundled local diffusion model or silent remote image API. Existing raster parts can generate motion frames completely locally.

Default storage is Node SQLite under .local/studio.sqlite. Set QH_STORAGE=json for atomic JSON files instead. QH_DATA_DIR changes the metadata/export location; authored artwork remains under public/animations. No login or cloud storage is needed. The HTTP service binds loopback and checks origin and host.

# Draft job: existing custom QH CLI

Integrate later, when its repository and required format are supplied. Map CLI operations onto this stable manifest, numerical engine and MCP tools. Preserve image-provider authorization, revision handling and export paths. Do not replace or edit the user's custom CLI now.

`export_motion` also supports `analysis`: a self-contained ZIP of typed binary maps, per-part layers and the `qh-analysis/1` manifest. Its labels and drawing order are authored; boundary distance is computed. `list_revisions` retrieves saved project snapshots. An exported motion JSON references its raster assets; export/package those assets with it when moving to another workspace.
