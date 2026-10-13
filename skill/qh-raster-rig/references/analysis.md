# Analysis provenance and acceptance

Store original RGBA, per-layer masks, visible part IDs, root and joints separately. A visible-ID map describes only the topmost part at an overlap. The other parts remain in their own alpha masks. Float boundary distances are chamfer approximations in pixels, not depth. Draw order is authored ordinal z, not distance in meters.

For a new character, use semantic or depth models only as uncertain proposals. See-through is the closest research route for completed anime layers and pseudo-depth, but requires its own environment and does not finish rigging. SAM-derived masks alone do not recover hidden anatomy. Cartoon shading can be painted; retain its original art unless appearance editing is needed. No learned vision model is bundled in this studio.

Technical acceptance uses declared gates: connected silhouette ratio >=0.995 for connected characters, no sampled uncovered limb joints, no off-canvas parts, no edge clipping, no triangle flips, no limit overrun, foot drift <=0.5 reference pixels. These are heuristic checks and can miss internal seam artifacts or bad acting. Some characters intentionally have detached elements and need explicit exclusions; never lower a gate merely to conceal a defect.

Quality score is for comparison after critical checks, not calibrated confidence. Review thin features, cuff overlap, torso/hand occlusion and bind-pose identity. Readability of an emotion needs visual review. The current renderer retains source texture per frame, avoiding accumulated interpolation blur.

Automatic fixes clamp rotations, restore declared planted contacts and lengthen overly fast timing. A repair history is persisted. It stops at acceptance or after three repairs; unresolved art is needs-art-review.

Future research adapters: illustration-specific part parsing, multi-frame joint fitting, local ARAP/biharmonic weights, optional pseudo-depth and intrinsic decomposition. Evaluate each independently on held-out characters and extreme poses before changing defaults. [See-through](https://arxiv.org/abs/2602.03749), [illustrated pose estimation](https://arxiv.org/abs/2108.01819), [cartoon shading](https://pubmed.ncbi.nlm.nih.gov/37021997/).

See the bundled docs/QH-garment-emotion-study.pdf for clothing ownership, bounded secondary response, resizing and actual regression findings. Sleeves stay with arms, not the stationary torso. Current drawstrings use a deterministic damped oscillator; no full cloth solver is claimed. The isolated supersampled mesh renderer has an interior-opacity regression to guard against triangle seams.
