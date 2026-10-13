# QH Motion bundle v1

`.qhmotion` is a self-contained UTF-8 JSON document with `schema: "qh-motion-bundle/1"` and `renderer: "qh-axis-shear/1"`. It is not a ZIP file with a renamed extension. It contains:

- Editable project: numeric rig, every saved timeline, selected motion and registered asset URLs.
- Every registered PNG: URL, base64 data, SHA-256 digest, decoded width and height.
- Compiled frames per clip: index, time and ordered parts with asset URL, visibility, opacity, local-to-canvas matrix rounded to six decimals and bend. Negative zero is normalized to JSON zero.
- Saved skeleton and character context, when available.

The importer validates rig/tracks, PNG signatures, checksums, dimensions, asset coverage and frame geometry recomputed from the rig/timeline. Object property order is irrelevant; frame and part order are significant. Limits: 32 MiB decoded PNG data, 256 assets, 64 clips, one million part/frame samples, 90 MB serialized bundle. These bounds are checked before writing project records. Technical file consistency is distinct from visual/anatomical approval.

Legacy JSON files retain local image URLs; use .qhmotion when moving a project between machines.

Import creates a separate character ID. It never replaces the current character. PNGs are copied to content-addressed local filenames, all referenced URLs are remapped, motion profiles are retained, and the rig's world coordinates stay the same. Imports require neither the original folder nor a remote image host. In development, `/animations` is proxied to the local API so newly imported textures are served immediately.

## User workflow

Export → QH Motion, or ⋯ → Import & export. The three configuration fields are workspace name, frame rate and duration. Advanced context/region/skeleton tools remain in the closeable inspector. Character, motion and representation selectors are searchable. Full-screen movement hides the library, inspector and track rows while keeping playback and scrubbing.

Select a rigid part, enable Draw motion path, and drag in the canvas. A new motion preserves the original and stores the stroke as parent-local X/Y tracks. Sampling time follows accumulated path length; rotations of parent parts are inverted at each sample. Mesh surface attachments use their mesh controls instead of a rigid stroke. A path is a non-looping draft and stops at its final frame; check it before final rendering.

## Agent / CLI

MCP tools: `export_qh_bundle(character)` and `import_qh_bundle(bundle, character?)`. Workspace settings show the actual local stdio connection configuration, with a copy action. Agents may continue to edit validated projects and custom motion tracks through the existing tools; they do not need to rebuild the studio UI.

```sh
node server/cli.mjs bundle-export fox
node server/cli.mjs bundle-import fox-copy /absolute/file.qhmotion
```

If an agent edits a bundle outside the studio, it must update the checksums and compile the affected frames using `compileFrames` from server/bundle.mjs. Stale frame data is deliberately rejected.

Validation evidence: bundle.test.mjs, path-motion.test.mjs, actual stdio MCP bundle round trip, workspace-v2-evidence.json and bundle-ui-evidence.json. The browser checks import all assets/motions, draw and save a new motion, preserve the original, and close export menus with Escape. Temporary imported test characters are removed after the check.
