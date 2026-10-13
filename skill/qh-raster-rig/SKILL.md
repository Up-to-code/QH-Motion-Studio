---
name: qh-raster-rig
description: Prepare layered raster characters with stable origins, numeric joints, constrained deformation, independent expressions, and deterministic motion. Use the bundled local React timeline studio, CLI, or MCP to compare candidates and export JSON, PNG frames, GIF, or MP4.
---

# QH Raster Rig

Use the existing studio and rig contract rather than rebuilding a preview UI for every character. The renderer-independent engine uses asset-pixel coordinates; viewport size never changes the anatomy or timeline.

## Open a workspace

`python scripts/studio.py init /absolute/workspace` copies the bundled studio. In that workspace use Node 24+, `pnpm install`, then `pnpm dev`. If a QH studio already exists, reuse it. `pnpm mcp` exposes local agent tools over stdio; see [the integration contract](references/integration.md). The future custom QH CLI adapter is a draft job, not an implemented dependency.

## Prepare the character

Preserve the accepted reference and its source hash. Use the agent's available image-generation tool for missing or hidden artwork; local motion rendering does not generate new artwork. Ask for transparent, independently usable parts with overlap behind joints. Split by motion responsibility, not merely by color. Keep left/right convention explicit. Facial features, hands and optional accessories can use registered replacement PNGs.

Follow [the rig mathematics](references/mathematics.md) for root units, hierarchy, pivots, bind transforms, mesh weights and time. Every part has an ID, parent, attachment offset, local image pivot, size, draw order, and declared limits. Import PNGs through the MCP, register assets in the rig, then save the validated project at its last-read revision. Do not label a full-body pose image as an independently rigged body.

## Analyze and animate

The studio's part IDs and draw order are authored from the rig. Boundary distance is computed from alpha. Grayscale is a display transform. None is inferred physical depth or automatic semantic segmentation. Record provenance before adding a model-backed adapter. Research and optional adapters are described in [analysis and validation](references/analysis.md).

Read the project with `get_project`, then edit its part properties or time-addressable tracks using `save_project`. For supported local actions use `generate_motion` (hello/hi, thinking, success, idle) to produce two saved candidates. Other actions require supplied custom tracks or new assets, not a misleading generic action result. Compare motion and identity at both original resolution and delivery size.

`fps` can be 24, 30 or 60; sampling does not change duration. Expression switches are explicit replacement/visibility keys. Keep contacts stable, use authored pauses and arcs, and constrain deformation locally. The same `stateAt(rig, clip, time)` drives preview and export. Use a fixed root and body-owned anchors; moving hands or tails must not redefine scale or recenter the character.

## Validate and deliver

Run `check_motion`, inspect the preview, and export the chosen candidate. A technical score is a ranking heuristic, not a percentage of artistic truth. Critical gates include connected anatomy, contact drift, joint coverage, mesh orientation, bounds, limits and loop compatibility. A small image error does not prove a requested gesture was performed.

Automatic repair is bounded to three attempts and changes only declared constraints or timing. Artwork gaps and identity failures require asset/rig correction. Preserve the previous candidate and report unresolved checks; do not repeatedly spend on image generation without authorization. Save source art, editable rig/timeline JSON, previews, metadata and provenance in `animations/<character>/`.

Export via `export_motion` or `node server/cli.mjs export CHARACTER CLIP json|gif|mp4|frames`. PNG/JSON preserve the editable rig; GIF supports transparency with palette limits, MP4 has a white matte. FFmpeg is required for GIF/MP4. The template includes tests for transforms, fps invariance, disconnected parts, bounded repair, revisions and exports; run `pnpm test` and `pnpm build` after engine or UI edits.
