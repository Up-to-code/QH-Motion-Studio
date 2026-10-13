# Player controls and evidence

The main header contains the motion name and library, representation, grid, skeleton, comparison, fit, focus and zoom controls. The secondary preview navigation was removed. Comparison selection stays beside its own preview because it selects that preview's clip.

The canvas retains native rig dimensions. CSS applies a separate presentation transform: translate(viewX%, viewY%) scale(zoom), around the canvas centre. Zoom and pan never modify joints, source pixels, timeline keys, exports or stored rig data. Canvas dimensions may be rectangular, and origin readouts use the project's actual origin rather than hardcoded Fox coordinates.

Click selection converts the pointer through the transformed canvas bounding rectangle back into rig pixels. Each visible part is rendered into a scratch canvas in descending z order using the same affine and mesh renderer as playback. A pixel with alpha >= 16 selects the first containing part. Transparent padding, hidden parts and blank canvas do not select a nearby joint. This includes deformed garments and expression assets.

Drag to pan. Select a part from the keyboard-accessible Parts library, then Focus selected part to centre it. Plus/minus zoom the focused canvas; zero restores fit. Selected joint x/y values are displayed in rig pixels. The joint overlay also shows parent-child connections; these are authored control connections, not inferred anatomy.

Asset loading is keyed by character and asset URLs. Editing coordinates does not restart the loader or reset the camera. Loading a different character resets fit and clears previous artwork while loading.

## Verification

Run `node scripts/player-ui-check.cjs` with the local server at port 8090. This uses an isolated headless browser and verifies header controls, removal of the second nav, focus, zoom, fit, pan, pixel selection, empty pixel behavior, comparison, and 390px layout overflow. Results: `player-ui-evidence.json`; visual evidence: `player-desktop.png`, `player-compare.png`, `player-mobile.png`. `npm run build` passes TypeScript and Vite compilation.

Rams quick_review was requested with via=rules for the changed UI files. The service refused because the workspace has exhausted its 15 review credits. Browser and source checks were still performed; no Rams approval is claimed.
