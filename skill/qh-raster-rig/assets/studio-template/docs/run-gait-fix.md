# Grounded Hero 1 cycle

The user correctly identified that the v0.3 run read as jumping. Its registered origin passed while foot clearance reached 58px and head travel reached 31px. That technical score did not certify the gait.

The active replacement uses eight newly generated compact right-side drawings, at 24 FPS over 0.5 seconds. Holds are 2, 2, 1, 1 samples per step: support receives more time and flight is brief. The original jump-like clip is archived in `public/animations/hero1/source/gait-v4/previous-project.json` and local version history.

All drawings use uniform scale 0.62. Contact frames register their measured yellow sole to y=420; flight frames use y=414. A palette mask measures sole height below the hoodie; it is specific to this accepted character, not a universal foot detector. Costume-hem X is a registration landmark, not inferred anatomy. Alpha components remove disconnected specks. Whole-image translations are permitted only because the replacement drawings have compatible downward leg articulation; head travel is independently checked so baseline alignment cannot hide a bouncing torso.

Checks: contact residual <=0.5px, flight clearance approximately 6px, head travel 10px, no source-edge clipping. `core/gait-review.mjs` rejects the old jumping example and accepts a grounded reference in regression tests. Near/far identity, arm counter-swing and perceived acting still require visual inspection; this is an improved generated pose cycle, not a biomechanical simulation.

Built-in imagegen generated two accepted four-drawing sheets. Prompt constraints: same Fox identity and right-facing 2D view; one complete supporting leg reaches down to a shared virtual floor; opposite leg recovers; opposite arm phases; low flight rather than horizontal leaps; same head/hip heights; full transparent margins, no glow, dust, text or shadows. One initial eight-drawing draft was rejected for glow and repeated poses. Raw accepted sheets, registration measurements and mathematical checks are saved with the character.

Reprocess: `python3 scripts/register-gait-v4.py`, then `node scripts/install-gait-v4.mjs`. The installer rejects failed gait/source checks before changing the active project. Pillow, NumPy and SciPy are needed only for source registration. Use the updated `hero1-run.qhmotion` to import the corrected assets and timeline.
