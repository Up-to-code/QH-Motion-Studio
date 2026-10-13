# Numeric rig contract

Canvas coordinates have +x right, +y down. Rotations are degrees clockwise. A canonical Fox canvas is 512 x 512, origin (256,256), fixed scale in asset pixels. Other characters may choose other saved dimensions. All rig math precedes viewport fitting.

For part i, attachment a_i is in the parent joint frame. Pivot c_i is inside the cropped asset. The joint frame is:

F_i(t) = F_parent(t) T(a_i + delta_i(t)) R(theta_i(t)) S_i(t)

Draw the local image with F_i(t) T(-c_i). Children inherit F_i, not the image translation. The bind pose, parent IDs and local units are serialized; no DOM measurements are needed. The engine's six matrix coefficients follow Canvas [a,b,c,d,e,f]. `point(matrix,[x,y])` applies this exactly.

Keep scale uniform for registration. Fit body-owned correspondences with a similarity transform rather than moving-silhouette centroids. One still image does not identify a unique wrist pivot; author it or fit it using trustworthy multi-frame correspondences and anatomical priors.

Current deformation uses a small local texture mesh. A smooth influence is w=d^2(3-2d) with d measured from the anchored root toward the free end. Vertex offsets are bend*w. A triangle affine transform maps source texture coordinates to the deformed triangle, clipped at that triangle. Signed triangle areas must stay positive. This is a constrained local deformation, not a general ARAP or learned skinning solver.

General bone skinning, for a later solver: v(t)=sum_j w_j(v) F_j(t) inverse(F_j(0)) v(0), weights nonnegative and summing to one. Preserve inverse bind transforms. Bounded biharmonic weights / ARAP are research candidates; do not claim they are installed.

A numeric key is interpolated with e(u)=10u^3-15u^4+6u^5 by default, or linear if selected. Visibility and asset replacement are discrete. Times are seconds. Frame n samples n/fps; 24/30/60 does not change the action duration. Final video usually contains duration*fps samples, without a duplicate endpoint frame. Loops must match their exact endpoint state.

References: [Umeyama](https://web.stanford.edu/class/cs273/refs/umeyama.pdf), [ARAP](https://www-ui.is.s.u-tokyo.ac.jp/~takeo/research/rigid/index.html), [bounded biharmonic weights](https://igl.ethz.ch/projects/bbw/), [compositing](https://keithp.com/~keithp/porterduff/p253-porter.pdf).

## Clothing ownership and secondary motion

Sleeve and cuff artwork belongs to shoulder/forearm controls, not torso pixels. The saved wardrobe masks must report zero sleeve pixels on the torso. Hidden surface is completed before moving extracted details. Wrinkle texture deforms with the garment; drawstrings and garment attachments have their own rules. Surface-attached detail anchors follow the parent mesh deformation. Current pocket/hem textures remain rigid around their moving anchors.

Secondary response solves theta'' + 2*zeta*omega*theta' + omega^2*theta = -gain*driverAngle'' at 1/240-second steps from zero, with a final partial step. It is bounded and given a terminal envelope for exact loop settling. It is a small controlled oscillator, not a full cloth/XPBD simulator.

`resizePart` scales local pivots, immediate child attachment offsets and contact markers in saved image units. Viewport resizing does not call it. The resize/restore test protects reversibility. Renderer compositing uses an oversampled mesh surface with overlap at adjacent triangle clips to avoid internal antialias seams.
