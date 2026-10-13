# Implementation evidence — 13 October 2026

| Requested capability | Delivered implementation | Evidence |
|---|---|---|
| One main navbar, clean player | Library/name/view/compare/fit/focus/zoom controls; no second preview navbar | player-ui-evidence.json; desktop/mobile screenshots |
| Presentation independent of anatomy | Camera pan/zoom and exact rendered-alpha selection | player-ui-check.cjs; independent affine tests |
| Skeleton before motion | Persistent authored joint graph, local anatomical anchors, parent edges, contact dots; draft/confirmed provenance | skeleton.test.mjs; skeleton.json; MCP integration |
| Correct numerical motion | Render-matching surface anchors/tangents, bounded mesh weights, resize track migration, RK4 secondary response, alpha-safe mesh seams | numericalAudit.test.mjs |
| Local pixel inspection | Original-resolution tiles and halos, occupied-region ordering, PNG crops, pair-overlap attachment tests, local RGBA loop comparison | regions.test.mjs; workflow-ui-evidence.json |
| Reusable specialist orchestration | Persistent named region claims, evidence submission, aggregate inspector tasks, arbitrary semantic categories | workflow.test.mjs; MCP integration |
| Test/check/fix loop | Retained candidates, detailed error-vector comparison, regression rejection, bounded declared-constraint repair; specialist handoff when numeric repair cannot apply | workflow.test.mjs |
| Memory and recovery | Identity/reference hash, appearance, intent, plan, decisions, failures/results; SQLite or JSON, revisions and serialized record edits | separate-process persistence and JSON tests |
| Other characters and motions | Explicit generic attachment/contact contracts, arbitrary IDs, rectangular canvases, authored templates/custom tracks; no silent Fox preset fallback | render-generic.test.mjs; skeleton.test.mjs |
| Save and reuse the method | Portable skill, local template, MCP/CLI, source archive; skeleton/context in JSON and analysis exports | skill validation; package_skill.py |

The Fox has 33 raster parts and 35 saved anchor nodes, including two explicit contact markers. Current hello/thinking/success/idle and joint-extreme samples have no measured clipping, contact violations, flipped triangles or declared attachment gaps. Their 100 technical score is a heuristic result for these tests, not 100% artistic truth.

The final test suite covers 56 distinct checks. Browser tests verify real API memory/report recovery, crops, 35-node skeleton, camera/selection, comparison and 390px layout with no page errors. Rams review was attempted with rules after UI edits; exhausted credits prevented that review.

No trained segmentation/anatomy model, optimized biharmonic solver or ARAP solver is bundled. Draft skeleton nodes are authored controls, not automatically inferred anatomical truth. Numeric inspectors are sampled tests; semantic identity, sleeve ownership and acting use retained specialist evidence. These are explicit workflow responsibilities rather than hidden claims of universal automatic error detection.
