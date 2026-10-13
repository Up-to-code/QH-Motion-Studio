import { secondaryAngle } from "./secondary.mjs";
import { drawMesh, deformPoint } from "./mesh.mjs";
// Renderer-independent numeric rig engine. Screen coordinates: +x right, +y down.
export const identity = () => [1, 0, 0, 1, 0, 0];
export function mul(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function point(m, p) {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}
export const translate = (x, y) => [1, 0, 0, 1, x, y];
export const rotate = (d) => {
  const a = (d * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
};
export const scale = (x, y = x) => [x, 0, 0, y, 0, 0];
export const smooth = (u) => {
  u = Math.max(0, Math.min(1, u));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export function sample(keys, t, discrete = false) {
  if (!keys?.length) return undefined;
  if (t <= keys[0].time) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1],
      b = keys[i];
    if (t <= b.time) {
      if (discrete || typeof a.value !== "number")
        return t === b.time ? b.value : a.value;
      let u = (t - a.time) / (b.time - a.time);
      if (b.ease !== "linear") u = smooth(u);
      return a.value + (b.value - a.value) * u;
    }
  }
  return keys.at(-1).value;
}
export function stateAt(rig, clip, time) {
  const t = Math.max(0, Math.min(clip.duration, time)),
    frames = {},
    draw = [];
  const visit = (p) => {
    if (frames[p.id]) return frames[p.id];
    const parent = p.parent
      ? visit(rig.parts.find((x) => x.id === p.parent))
      : translate(...rig.origin);
    const props = {
      rotation: p.rotation || 0,
      x: p.position[0],
      y: p.position[1],
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      asset: p.asset,
      bend: 0,
      visible: p.visible !== false,
    };
    for (const track of clip.tracks.filter((x) => x.part === p.id)) {
      const value = sample(
        track.keys,
        t,
        ["asset", "visible"].includes(track.property),
      );
      if (value !== undefined) props[track.property] = value;
    }
    if (p.surfaceAttachment && p.parent) {
      const parentPart = rig.parts.find((x) => x.id === p.parent),
        parentState = draw.find((x) => x.id === p.parent);
      if (parentPart?.mesh && parentState) {
        const bind = [
            p.position[0] + parentPart.pivot[0],
            p.position[1] + parentPart.pivot[1],
          ],
          moved = deformPoint(parentPart, bind, parentState.bend);
        props.x += moved[0] - bind[0];
        props.y += moved[1] - bind[1];
      }
    }
    if (p.secondary)
      props.rotation += secondaryAngle(p.secondary, clip, t, sample);
    const frame = mul(
      mul(mul(parent, translate(props.x, props.y)), rotate(props.rotation)),
      scale(props.scaleX, props.scaleY),
    );
    frames[p.id] = frame;
    draw.push({
      ...p,
      ...props,
      matrix: mul(frame, translate(-p.pivot[0], -p.pivot[1])),
      joint: point(frame, [0, 0]),
      frame,
    });
    return frame;
  };
  for (const p of rig.parts) visit(p);
  return draw.sort((a, b) => a.z - b.z);
}
/** @param {any} options */
export function drawRig(ctx, rig, clip, time, images, options = {}) {
  const {
    grid = false,
    joints = false,
    selected = null,
    hidden = [],
  } = options;
  ctx.clearRect(0, 0, ...rig.canvas);
  for (const p of stateAt(rig, clip, time)) {
    if (!p.visible || hidden.includes(p.id)) continue;
    const img = images[p.asset];
    if (!img) continue;
    ctx.save();
    ctx.transform(...p.matrix);
    ctx.globalAlpha = p.opacity;
    if (p.mesh) drawMesh(ctx, img, p, p.bend, options.createCanvas);
    else ctx.drawImage(img, 0, 0, ...p.size);
    if (selected === p.id) {
      ctx.strokeStyle = "#7c3aed";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(0, 0, ...p.size);
    }
    ctx.restore();
  }
  if (grid) {
    ctx.save();
    ctx.strokeStyle = "rgba(124,58,237,.09)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= rig.canvas[0]; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rig.canvas[1]);
      ctx.stroke();
    }
    for (let y = 0; y <= rig.canvas[1]; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rig.canvas[0], y);
      ctx.stroke();
    }
    ctx.strokeStyle = "#8b5cf6";
    ctx.beginPath();
    ctx.moveTo(rig.origin[0], 0);
    ctx.lineTo(rig.origin[0], rig.canvas[1]);
    ctx.moveTo(0, rig.origin[1]);
    ctx.lineTo(rig.canvas[0], rig.origin[1]);
    ctx.stroke();
    ctx.strokeStyle = "#16a34a";
    ctx.beginPath();
    ctx.moveTo(0, rig.ground);
    ctx.lineTo(rig.canvas[0], rig.ground);
    ctx.stroke();
    ctx.restore();
  }
  if (joints) {
    ctx.save();
    ctx.font = "9px monospace";
    for (const p of stateAt(rig, clip, time)) {
      ctx.fillStyle = p.id === selected ? "#ef4444" : "#7c3aed";
      ctx.beginPath();
      ctx.arc(...p.joint, 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (p.id === selected)
        ctx.fillText(
          `${p.id} (${p.joint.map((x) => x.toFixed(1)).join(", ")})`,
          p.joint[0] + 7,
          p.joint[1],
        );
    }
    ctx.restore();
  }
}
export function validateRig(rig) {
  const errors = [];
  if (!rig || rig.version !== 1) errors.push("Unsupported rig version");
  if (
    !Array.isArray(rig?.canvas) ||
    rig.canvas.length !== 2 ||
    rig.canvas.some((n) => !Number.isFinite(n) || n < 64 || n > 2048)
  )
    errors.push("Canvas must be 64–2048 pixels");
  if (
    !Array.isArray(rig?.origin) ||
    rig.origin.length !== 2 ||
    rig.origin.some((n) => !Number.isFinite(n))
  )
    errors.push("Origin required");
  if (
    !Array.isArray(rig?.parts) ||
    rig.parts.length < 1 ||
    rig.parts.length > 128
  )
    return [...errors, "Parts required (1–128)"];
  const ids = new Set();
  for (const p of rig.parts) {
    if (!/^[a-z0-9_-]+$/.test(p.id) || ids.has(p.id))
      errors.push(`Duplicate or unsafe id ${p.id}`);
    ids.add(p.id);
    for (const field of ["pivot", "position", "size"])
      if (
        !Array.isArray(p[field]) ||
        p[field].length !== 2 ||
        p[field].some((n) => !Number.isFinite(n))
      )
        errors.push(`${p.id}: invalid ${field}`);
    if (p.size?.some((n) => n <= 0 || n > 2048))
      errors.push(`${p.id}: size out of range`);
    if (p.parent !== null && typeof p.parent !== "string")
      errors.push(`${p.id}: invalid parent`);
    if (
      p.secondary &&
      (!Number.isFinite(p.secondary.frequencyHz) ||
        p.secondary.frequencyHz < 0.1 ||
        p.secondary.frequencyHz > 12 ||
        !Number.isFinite(p.secondary.damping) ||
        p.secondary.damping < 0.1 ||
        p.secondary.damping > 2 ||
        !Number.isFinite(p.secondary.maxDegrees) ||
        p.secondary.maxDegrees > 30 ||
        p.secondary.maxDegrees < 0 ||
        !Number.isFinite(p.secondary.gain) ||
        Math.abs(p.secondary.gain) > 1)
    )
      errors.push(`${p.id}: invalid secondary response`);
    if (!Number.isFinite(p.z)) errors.push(`${p.id}: invalid draw order`);
    if (
      typeof p.asset !== "string" ||
      !/^\/animations\/[a-z0-9_\-/]+\.png$/.test(p.asset) ||
      p.asset.includes("..")
    )
      errors.push(`${p.id}: unsafe asset`);
  }
  for (const p of rig.parts) {
    const seen = new Set([p.id]);
    let id = p.parent;
    while (id) {
      if (seen.has(id)) {
        errors.push(`${p.id}: hierarchy cycle`);
        break;
      }
      seen.add(id);
      const parent = rig.parts.find((x) => x.id === id);
      if (!parent) {
        errors.push(`${p.id}: missing parent ${id}`);
        break;
      }
      id = parent.parent;
    }
  }
  return errors;
}
export function validateClip(rig, c) {
  const errors = [];
  if (
    !c ||
    ![24, 30, 60].includes(c.fps) ||
    !Number.isFinite(c.duration) ||
    c.duration <= 0 ||
    c.duration > 30
  )
    return ["Clip requires fps 24/30/60 and duration 0–30 seconds"];
  if (!/^[a-z0-9_-]+$/.test(c.id) || typeof c.name !== "string")
    errors.push("Clip id/name required");
  if (!Array.isArray(c.tracks) || c.tracks.length > 512)
    return [...errors, "Tracks required"];
  for (const t of c.tracks) {
    if (!rig.parts.some((p) => p.id === t.part))
      errors.push(`Unknown part ${t.part}`);
    if (
      ![
        "rotation",
        "x",
        "y",
        "scaleX",
        "scaleY",
        "opacity",
        "bend",
        "asset",
        "visible",
      ].includes(t.property)
    )
      errors.push(`Unknown property ${t.property}`);
    if (!Array.isArray(t.keys) || !t.keys.length || t.keys.length > 500) {
      errors.push("Invalid keys");
      continue;
    }
    let last = -1;
    for (const k of t.keys) {
      if (
        !Number.isFinite(k.time) ||
        k.time < 0 ||
        k.time > c.duration ||
        k.time <= last
      )
        errors.push("Keys must increase within duration");
      last = k.time;
      if (t.property === "asset") {
        if (!rig.assets?.includes(k.value))
          errors.push("Unregistered replacement asset");
      } else if (t.property === "visible") {
        if (typeof k.value !== "boolean")
          errors.push("Visibility must be boolean");
      } else if (!Number.isFinite(k.value))
        errors.push("Numeric track value required");
      else if (t.property === "bend" && Math.abs(k.value) > 40)
        errors.push("Bend exceeds 40 local pixels");
      else if (
        ["scaleX", "scaleY"].includes(t.property) &&
        (k.value < 0.2 || k.value > 3)
      )
        errors.push("Scale out of range");
      else if (t.property === "opacity" && (k.value < 0 || k.value > 1))
        errors.push("Opacity out of range");
    }
  }
  return errors;
}
