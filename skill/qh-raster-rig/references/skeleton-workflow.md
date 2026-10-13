# Skeleton-first motion and regional inspection

The accepted raster art remains the source image. A skeleton is a separate numerical contract: joint IDs, parent edges, rest positions, image pivots, rest lengths, contact markers and coordinate provenance. The initial graph comes from authored rig pivots, not silhouette centres. It is saved as **draft** because a clothing or eyebrow control is not automatically an anatomical joint. Agents must confirm anatomy from the reference before claiming a valid shoulder, elbow, wrist, knee or ankle.

## Coordinates and tests

Canvas coordinates use x-right/y-down. A part frame is `F_parent · T(offset) · R(angle) · S(scale)`. Artwork uses `F_part · T(-imagePivot)`. An anatomical dot can declare `local:[x,y]` in its bound part frame. The saved rest position is independently compared against the current rig; changing a cut or pivot does not silently move the contract.

Bone consistency is evaluated in the parent's coordinate system using the inverse affine transform. This removes global rotation and parent nonuniform scale from the error. Moving a child offset changes local bone length and is reported. Surface-bound controls declare `lengthPolicy:'surface'`; intended independent translations can declare `'free'`. A rest node's world length is descriptive; the checker uses the saved rest coordinates to compute the parent-local reference length.

Foot contact dots use authored image-space points. Contact schedules belong to the motion: standing periods require stable target points; walking/swing periods must not be incorrectly locked. Each motion can override the default rig contacts through `clip.contacts`. Current render checks accept explicit activeIntervals, target/referenceTime and tolerance contracts. Clothing sleeves travel with the arm. Cuffs, drawstrings, hems and facial layers have their own controls and ownership.

## Saved agent workflow

1. `get_project`, `get_character_context`, `get_skeleton`.
2. Record identity/reference, appearance, intended action, limitations and decisions using `save_character_context`.
3. Confirm or correct anchors using `save_skeleton`. Keep unfamiliar anatomy draft until reviewed.
4. Author tracks through `create_custom_motion` or the timeline. Built-in Fox actions are character-specific; unfamiliar rigs need their own templates/tracks.
5. `inspect_regions` runs skeleton, rendered attachment/loop and technical inspectors. It also creates a pending artwork-review task.
6. `get_inspection_region` accepts an optional motion time and returns the original-pixel core, overlapping halo, PNG crop, saved plan and skeleton. Tiles divide inspection work, not the character art.
7. Use `claim_inspection_region` for named specialists; `submit_region_review` retains local evidence and new semantic error categories. Claims persist and are serialized across local MCP processes.
8. `test_motion_patch` evaluates a proposed rig/clip without replacing the project. It records error vectors and rejects new measured regressions or reduced technical quality. Review the retained candidate, then publish explicitly with `save_project` at the current project revision.
9. `record_inspector_review` records a specialist's evidence. `resume_inspection` restores the report. Reinspect after project changes; old reports are intentionally invalidated.

Local inspector roles are deterministic checks. External agents use MCP to perform semantic/visual review; this app does not contain a hidden LLM orchestrator. Numeric acceptance does not certify anatomical correctness, identity, acting or clean art. Unknown failures should be recorded as new evidence/categories, not silently treated as passing.

## Regional contracts

Tiles are 8,16,32 or64 original pixels with a configurable halo. Required attachment regions compare actual parent **and** child alpha overlap near the joint. Declare `part.attachment={required:true,radiusPx:8,minOverlap:1}` only for a physical connection; a facial overlay or deliberately detached accessory can be exempt. Loop checks compare RGBA in every tile when `clip.loop:true`, detecting replacement/visibility differences that matrix-only checks miss.

Current gaps: no automatic semantic segmentation, learned pose detector, trained anatomy model, inverse-kinematics solver, ARAP solver or optimized biharmonic weight generator is bundled. The current mesh remains a bounded authored deformation model. The pipeline exposes evidence and editable constraints so these adapters can be evaluated independently.

## Research basis and implementation distinction

[Bounded Biharmonic Weights (Jacobson et al.,2011)](https://homes.cs.washington.edu/~jovan/papers/jacobson-2011-bbw.pdf) explains constrained smooth influence weights for handles/bones. It supports the direction of explicit skeleton controls with bounded weights. Our implementation uses bounded analytic mesh weights; it does **not** claim to solve that paper's biharmonic optimization.

[As-Rigid-As-Possible Shape Manipulation (Igarashi et al.,2005)](https://cs.brown.edu/people/jhughes/papers/Igarashi-ASM-2005/main.htm) uses triangle handles and distortion minimization. It is a useful next candidate for protecting limb/clothing shape under large movement. The implemented triangle renderer and consistency tests are not an ARAP solver. Compare an adapter against the accepted raster reference, joint anchors, overlap, alpha, mesh orientation and temporal tests before adopting it.

## Verified evidence

`tests/skeleton.test.mjs`: independent rest anchors, arbitrary IDs and rectangular canvas; parent scaling; changed pivot/offset; animated child translation; cycle/NaN rejection.

`tests/numericalAudit.test.mjs`: independent transform/mesh/oscillator oracles and translucent seam alpha.

`tests/regions.test.mjs`: exact tile coverage, boundary halo visibility, pairwise overlap.

`tests/workflow.test.mjs`: persisted context across a separate Node process, revisions, saved inspector tasks, PNG evidence, patch non-overwrite.

Browser evidence lives in `docs/player-ui-evidence.json` and `docs/workflow-ui-evidence.json`. Rams quick_review via rules was requested after UI changes but refused because review credits were exhausted; it has not certified this UI.

`repair_inspection` runs one bounded numeric repair batch and retains a candidate. It does not overwrite the current project or treat a numeric pass as artistic approval. `get_motion_candidate` reads a retained proposal. New semantic findings require fresh specialist evidence.

Velocity is measured in canvas pixels per second. The default432px/s is a technical heuristic; set `rig.motionPolicy.maxJointVelocityPxPerSecond` for the character/action scale. It is not a universal biological motion limit.

Inspection snapshots hash the actual raster bytes as well as rig and clip data. Imported assets use content-addressed filenames so a new arm cannot silently overwrite a previously reviewed arm. JSON and analysis exports retain saved skeleton and agent context.

Agent context keeps the latest100 history entries to stay usable; full inspection evidence and prior context revisions remain separate persistent records. Large frame-level error sets therefore do not overwhelm the working context.

Snapshots also include the loaded engine/inspector source fingerprint. Restart the local backend after editing core/server modules; then reinspect so preview and offline checks use the same implementation.

Contact dots are image-space material points: they follow the actual rendered mesh before the affine part transform. Anatomical/control nodes remain bone-frame anchors. This prevents a bent shoe from reporting a stationary contact merely because its bone did not translate.

MCP region inspection returns a native PNG image content block plus numeric metadata, so a vision-capable agent can inspect the crop directly. The local HTTP API retains a data URL for the React crop viewer.
