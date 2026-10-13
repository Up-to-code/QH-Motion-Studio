# Running that looks like jumping

Observed failure: Hero 1 passed numeric hip registration but its lowest feet ranged from y=360 to 418 and its head moved 31 pixels. Dramatic horizontal strides and long airborne holds made the cycle look like repeated jumps. Registering hips is insufficient; do not call alignment score 100 a successful run.

For a level-ground run, author the contact/support/passing/brief-flight phases and near/far limb identities before generating. Use small flight clearance, legs reaching down toward one shared virtual floor, alternating support legs and arm/leg counter-swing. Keep whole-character scale and fixed camera. Do not independently scale limbs or ground-align every frame: that can hide bad anatomy by making the torso bounce instead.

Measure the soles and head/root against the fixed virtual floor. Use `core/gait-review.mjs` for contact residual, flight clearance, head travel and flight fraction. Thresholds are configurable for character size and intended stylization: the Hero example uses 3px contact tolerance, at most 12px flight clearance and 14px head travel on a 512px canvas. Those are project limits, not universal biomechanics. Phase and side labels are authored inputs, not computer vision predictions.

Reject a jump-like source drawing and regenerate it if grounded soles and modest hip/head travel cannot coexist at the same shared scale. Small translations and timing changes can fix registration; they cannot straighten or bend a generated leg. Review slowed playback, ordinary-speed playback and the seam. Check whether feet alternate support rather than move together, whether elbows counter-swing, and whether the complete foot follows ankle ownership. Archive rejected assets and measured findings; keep the defective run out of the approved list. Never certify emotion or gait using alpha connectivity alone.

## Pacing and genuine in-betweens

The next observed failure was excessive speed: the eight drawings completed a cycle in only 0.5 seconds. Set the intended cycle duration separately from sampling FPS. Slow the action by extending time and authoring holds, not by claiming that 60 FPS makes more drawings. If abrupt pose changes remain, generate genuine intermediate artwork for the actual gaps; repeated frames or alpha cross-fades do not create new anatomical poses. Preserve earlier candidates.

Review every distinct drawing and every compiled output sample, including wraparound. Record source hash, pose index, sample index/time and hold count. Measure floor, body travel and short flight after registration. Flight fraction must be weighted by hold duration: a single airborne drawing held for most of the cycle is still a jumping problem. The revised 12-drawing, 24-sample cycle at 24 FPS lasts 1 second; these counts describe different things. Use the intended playback speed as well as slowed inspection before selecting a candidate.
