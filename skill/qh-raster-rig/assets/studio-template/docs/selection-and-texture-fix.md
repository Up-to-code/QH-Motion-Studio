# Selection and texture correction — 2026-10-13

The stage now stores the geometry of its painted frame. Pointer-down pauses playback and captures that geometry; pointer-up selects its topmost nontransparent visible layer. Camera zoom and pan remain presentation-only. This avoids sampling a later animation pose during a click.

Detailed tail texture now uses an inverse shear with premultiplied-alpha bilinear sampling at 2x resolution. Each output pixel has one source sample. Expanded triangle clip compositing was removed: flat-color seam tests did not exercise detailed gradients, alpha boundaries or browser behavior.

The original waving hand image had its wrist at the bottom, but the resting-hand rig expects its wrist near the top. A reproducible registration script creates a replacement PNG at the unchanged (17.5,9) wrist anchor. Original source art and all body joints/timing remain available. Existing local Fox candidates have been migrated to the registered wave asset.

Validation: 60 automated tests; production build; animated hand selection after pan and zoom; pointer-down pauses and keeps the frame stable; existing desktop/mobile/compare camera checks. Evidence: selection-fix-evidence.json and selection-fix.png. Rams rules review was attempted but the service refused because its one-time review credits were exhausted.

These checks verify selection, texture continuity and wrist registration. They do not certify every character cut or anatomical joint.
