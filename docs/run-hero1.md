# Hero 1 right-side run revision

Archived v0.3 notes: the user identified this cycle as jump-like. It is superseded by the grounded gait correction; see running-gait.md in the skill or docs/run-gait-fix.md in the studio.

The active Fox front rig now has a smaller mouth centered below the nose and one complete ankle-and-shoe assembly, uniformly scaled and mirrored for the other foot. The old motion set is archived at `public/animations/fox/source/regenerated-v3/previous-project.json`, in local history, and in release v0.2.0. The neutral Ready pose does not claim to depict thinking. Old concerned-mouth gestures are no longer offered by the active action selector.

Hero 1 uses eight generated whole-character drawings, sampled at 24 FPS with three samples per drawing. It is a pose library, not eight independent layered skeletons or 24 unique drawings. Depth is represented by side-view artwork and limb occlusion, not a 3D model. The run is a reviewed draft: gait and acting remain visual judgments. Technical score 100 is not 100% animation quality.

## Registration

`source/registration.json` retains the measured source hip, cell, SHA-256, translation, uniform scale (0.62) and intended vertical bob. For source hip h, shared scale s and desired registered hip o + b:

`t = round(o + b - s h)`

`registeredHip = s h + t`

Rounding residual must be below 0.8 pixels; every frame uses the same scale. The deliberate vertical offsets are 0, 8, -2, -12 repeated across the second half. Whole-silhouette bounds and moving feet never define the origin. Detached alpha specks are removed with connected-component masking; this step does not invent anatomy or generate poses.

Frame registration, camera consistency and source margins pass. Technical checks find no clipping. Source PNGs, editable pose timeline and registration metadata are included in the repository. `.qhmotion` includes the registered textures and deterministic rendered-frame data for import.

## Generation and iteration

Built-in imagegen was used with the accepted Fox as reference. Three eight-pose sheets were rejected because of glow or repeated arm phases. Two four-pose sheets were then generated and registered as eight poses. Prompt specification: right-facing profile, identical orange fox/purple hoodie/pants/yellow sneakers, fixed character proportions, complete two feet and arms, near/far limb shading, arm/leg counter-swing, full-body transparent margins, no shadows, glow, marks or text. The second sheet requests complementary forward/backward arm phases. Foot prompt: a single complete outward-pointing left foot with a closed rounded orange ankle, yellow sneaker, cream sole, full toe/heel and transparent margin. The accepted foot is mirrored as an entire assembly.

## UI and checks

Agent controls are inside settings. Sidebar visibility lives in Configuration. Its top three-dot control opens those settings. The centered timeline can be dragged, resized or moved with arrow keys, and clamps to the viewport after resizing. Double-click its grip restores the centered layout.

Rams quick_review with via=rules was attempted; the service refused because its review credits are exhausted. Browser checks verify settings-only agent controls, sidebar visibility, player movement/resizing and mobile bounds. Unit tests retain the historical v0.2 rig as a fixture for legacy transform coverage while testing active-action rejection separately.
