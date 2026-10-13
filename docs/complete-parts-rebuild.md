# Complete-parts rebuild — 2026-10-13

The visible defect was source artwork, not merely selection: the tail ended at an image boundary; a hip connector drawn over the legs looked like shorts. The old wave replacement lacked hidden wrist coverage.

The built-in image generator produced a full tail, hip connector, trouser leg used for both legs, and a waving hand with complete wrist extension. Sources, exact prompts and hashes are in public/animations/fox/source/regenerated-v2/generation-manifest.json. The first hip candidate was rejected for a purple halo. All original PNGs remain available.

All 33 rig parts and their tracked replacement assets have transparent safety margins. Material points and image pivots shift equally; child positions and world bones are unchanged. Mesh domains preserve the original deformation field. This is padding, not reconstructed anatomy: only the four named source assets above were regenerated. Semantic completeness of every facial/clothing source remains a visual review responsibility.

The hip connector now draws behind thighs; hidden wrist overlap draws behind the forearm and cuff. Presets resolve rig-owned replacement assets, including all mouth poses. Source margin failures are recorded separately from canvas clipping and make technical acceptance fail.

Validation: full automated suite, production build, animated selection after zoom/pan, and hello/thinking/success/idle plus joint-extreme render checks. Final counts and metrics are in rig-qa.json; source alpha margins are in complete-parts-audit.json. Complete-parts-preview.png and regenerated GIF/MP4 previews show the assembled result. The score is a technical heuristic, not anatomical truth.
