export function makeMotion(rig, name = "hello", fps = 24, candidate = "a") {
  if (rig.id !== "fox" && !["nia","orbit"].includes(rig.id)) {
    const template=rig.motionTemplates?.[name];
    if(template) return {...structuredClone(template),id:`${name}-${candidate}`,name:template.name || name,fps,candidate};
    if(name !== "idle") throw Error("This character needs an authored motion template or custom tracks for this action");
    return {id:`idle-${candidate}`,name:"Rest pose",duration:2.4,fps,candidate,tracks:[]};
  }
  const duration = name === "hello" ? 3 : name === "success" ? 3.7 : 2.4;
  const tracks = [];
  const add = (part, property, values) => {
    if (rig.parts.some((p) => p.id === part))
      tracks.push({
        part,
        property,
        keys: values.map(([t, v]) => ({
          time: t * duration,
          value: v,
          ease: "smooth",
        })),
      });
  };
  if (rig.mode === "poses") {
    if(name === "hello")throw Error("This pose library has no hello action; supply authored frames or custom tracks");
    if(rig.parts.length!==1 && !rig.posePart)throw Error("Declare the part controlled by this pose library");
    return {
      id: `${name}-${candidate}`,
      name: name[0].toUpperCase() + name.slice(1),
      duration,
      fps,
      candidate,
      tracks: [
        {
          part: rig.posePart ?? rig.parts[0].id,
          property: "asset",
          keys: [
            { time: 0, value: rig.assets[0] },
            {
              time: duration * 0.25,
              value:
                rig.assets[
                  name === "success" ? 2 : name === "thinking" ? 1 : 0
                ],
            },
            { time: duration, value: rig.assets[0] },
          ],
        },
      ],
    };
  }
  const strength = candidate === "b" ? 1.12 : 1;
  if (name === "hello") {
    add("upper_arm_right", "rotation", [
      [0, 0],
      [0.26, -115 * strength],
      [0.7, -115 * strength],
      [1, 0],
    ]);
    add("forearm_right", "rotation", [
      [0, 0],
      [0.26, -30],
      [0.7, -30],
      [1, 0],
    ]);
    add("hand_right", "rotation", [
      [0, 0],
      [0.22, -12],
      [0.32, 18],
      [0.42, -18],
      [0.52, 18],
      [0.62, -12],
      [0.72, 0],
      [1, 0],
    ]);
    add("hand_right", "asset", [
      [0, "/animations/fox/parts/hand_rest.png"],
      [0.1, "/animations/fox/parts/hand_wave.png"],
      [0.86, "/animations/fox/parts/hand_rest.png"],
    ]);
    add("tail", "bend", [
      [0, 0],
      [0.25, -9],
      [0.5, 9],
      [0.8, -3],
      [1, 0],
    ]);
    add("ear_right", "rotation", [
      [0, 0],
      [0.23, -4],
      [0.38, 2],
      [0.6, 0],
      [1, 0],
    ]);
    add("tail", "rotation", [
      [0, 0],
      [0.18, -5],
      [0.45, 5],
      [0.7, -2],
      [1, 0],
    ]);
  } else if (name === "thinking") {
    add("head", "rotation", [
      [0, 0],
      [0.25, -6],
      [0.75, -6],
      [1, 0],
    ]);
    add("brow_left", "rotation", [
      [0, 0],
      [0.25, -14],
      [0.75, -14],
      [1, 0],
    ]);
    add("brow_right", "rotation", [
      [0, 0],
      [0.25, 10],
      [0.75, 10],
      [1, 0],
    ]);
    add("pupil_left", "x", [
      [0, 2],
      [0.3, 5],
      [0.75, 5],
      [1, 2],
    ]);
    add("pupil_right", "x", [
      [0, 2],
      [0.3, 5],
      [0.75, 5],
      [1, 2],
    ]);
    add("mouth", "asset", [
      [0, "/animations/fox/parts/mouth_smile.png"],
      [0.2, "/animations/fox/parts/mouth_concerned.png"],
      [duration / duration, "/animations/fox/parts/mouth_smile.png"],
    ]);
  } else if (name === "success") {
    add("upper_arm_right", "rotation", [
      [0, 0],
      [0.2, -115],
      [0.7, -115],
      [1, 0],
    ]);
    add("upper_arm_left", "rotation", [
      [0, 0],
      [0.2, 115],
      [0.7, 115],
      [1, 0],
    ]);
    add("mouth", "asset", [
      [0, "/animations/fox/parts/mouth_smile.png"],
      [0.16, "/animations/fox/parts/mouth_happy.png"],
      [0.9, "/animations/fox/parts/mouth_smile.png"],
    ]);
    add("tail", "rotation", [
      [0, 0],
      [0.18, -8],
      [0.4, 8],
      [0.62, -8],
      [0.82, 5],
      [1, 0],
    ]);
  } else if (name === "idle") {
    add("ear_left", "rotation", [
      [0, 0],
      [0.35, -3],
      [0.55, 0],
      [1, 0],
    ]);
    add("tail", "rotation", [
      [0, 0],
      [0.4, -3],
      [0.75, 2],
      [1, 0],
    ]);
  } else
    throw new Error(
      "Supported motions: hello, thinking, success, idle. Import custom tracks for other actions.",
    );
  if (candidate === "b" && name !== "hello")
    for (const track of tracks)
      if (track.property === "rotation" || track.property === "bend")
        for (const key of track.keys) key.value *= strength;
  for (const side of ["left", "right"]) {
    add("eye_" + side, "visible", [
      [0, true],
      [0.79, false],
      [0.84, true],
    ]);
    add("pupil_" + side, "visible", [
      [0, true],
      [0.79, false],
      [0.84, true],
    ]);
    add("lid_" + side, "visible", [
      [0, false],
      [0.79, true],
      [0.84, false],
    ]);
  }
  return {
    id: `${name}-${candidate}`,
    name: name[0].toUpperCase() + name.slice(1),
    duration,
    fps,
    candidate,
    tracks,
  };
}
