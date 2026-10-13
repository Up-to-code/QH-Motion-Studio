# QH Motion Studio

Local layered raster animation, reusable agent skill, and an embeddable mathematical engine. The studio has a collapsible character/part library, joint inspector, keyframe timeline, numeric maps, side-by-side candidate previews and deterministic exports.

## Start

Node 24+, pnpm, and FFmpeg for GIF/MP4.

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:8090. The local API uses 8091. Production: `pnpm build && pnpm start` opens the built app at 8091.

## Agent / CLI

```sh
pnpm mcp
node server/cli.mjs inspect fox
node server/cli.mjs generate fox hello 24
node server/cli.mjs quality fox hello-a
node server/cli.mjs export fox hello-a gif
```

Generation creates unique saved candidate IDs. Read the response or project before exporting a generated candidate. Motion actions: hello/hi, thinking, success, idle. Arbitrary actions need custom tracks or generated art supplied by the agent. `prepare_image_job` prepares the prompt/contract; `import_png` stores generated artwork. No image model is bundled and no remote image service is called silently.

SQLite persists projects, revision snapshots and generation jobs in `.local/studio.sqlite`. `QH_STORAGE=json` uses JSON files instead. `QH_DATA_DIR=/path` selects another metadata/export folder. Raster assets live under `public/animations`.

## Rig and mathematics

`core/engine.mjs` exports deterministic `stateAt(rig,clip,time)`, matrices and Canvas drawing. It reads no viewport and owns no animation clock. Each part has parent, attachment, local pivot, size, palette and order. Fox has 33 independently controllable parts; Nia and Orbit are registered pose libraries. Optional hats are an empty attachment slot.

The tail has a constrained local texture mesh and smooth vertex influence. Joint hierarchy, duration and key interpolation are shared between React preview and offline render. Mesh orientation, connected anatomy, contact drift, bounds, limits and loop checks help reject broken motion. A technical score is not a percentage of artistic truth.

Analysis views show grayscale, authored visible IDs, computed chamfer boundary distance and authored draw order. They are not inferred semantic/depth predictions. No SAM, See-through, ARAP or learned shadow model is installed. Their research and future evaluation are in `docs` and skill references.

## Skill

`skill/qh-raster-rig` is portable and includes a studio template and a launcher. Copy it to your agent's skill directory, or use `python skill/qh-raster-rig/scripts/studio.py init /empty/folder`. Existing custom QH CLI integration is a future draft job in the integration reference.

## Validation

`pnpm test` covers transforms, FPS invariance, constraints, disconnected parts, bounded repair and revision conflicts. `pnpm build` checks TypeScript and the production bundle. Screenshots, browser checks and example exports are in `docs` and `public/animations/fox/previews`.

PNG and JSON preserve editable data; GIF has palette/transparency limitations; MP4 uses a white matte. UI hidden-part toggles are preview-only and do not remove parts from an export. Use a visibility track for exported hiding.

## Rights and provenance

Generated Fox artwork was produced with the built-in image tool from the accepted project reference. Source atlas, parts and prompt metadata are retained. shadcn/ui Button is adapted under MIT. Dependency notices apply independently. This project does not redistribute weights or assets from the cited research models. Code is MIT; generated project artwork is supplied separately under the accompanying asset terms.

Analysis export includes a self-contained ZIP with row-major visible IDs (uint16), ordinal draw order and signed chamfer distance (float32), per-layer RGBA PNGs, joints, transforms and provenance. The React export menu, CLI and MCP support `analysis` alongside media formats. Project saves retain revision snapshots; `list_revisions` exposes them to an agent.

Optional source-asset reconstruction: install `scripts/requirements-assets.txt`, then run `python scripts/rebuild_assets.py`. This reconstructs the authored Fox masks from the retained generated sheets; it does not perform new image generation. Mobile atlas export: `node scripts/export_mobile.mjs /absolute/destination-app` writes only that app's `assets/animations/fox` folder.

## Skeleton-first inspection

The main navbar owns library, camera, comparison and view controls. Fit/focus/pan/zoom affect only the camera; selection follows rendered alpha. The inspector saves character context and regional reports locally.

`get_skeleton` reads a persistent draft/confirmed graph of authored joint anchors and contact dots. `inspect_regions` saves numerical checks and halo crops. Named specialists claim regions with `claim_inspection_region`, submit evidence with `submit_region_review`, and resume with `resume_inspection`. `repair_inspection` and `test_motion_patch` preserve prior candidates and reject measured regressions. Arbitrary rigs can use `create_custom_motion`; Fox presets are not silently applied to unrelated anatomy.

See [skeleton mathematics and regional workflow](docs/skeleton-and-regional-workflow.md). Technical checks do not automatically certify anatomical labels, artwork or acting.

## Project links

[Source](https://github.com/Up-to-code/QH-Motion-Studio) · [Issues](https://github.com/Up-to-code/QH-Motion-Studio/issues) · [Public project directory](https://github.com/qentrah/.github/blob/main/profile/PROJECTS.md)
