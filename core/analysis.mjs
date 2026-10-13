import { drawMesh } from "./mesh.mjs";
import { drawRig, stateAt } from "./engine.mjs";
// Chamfer distance in canvas pixels. Exactness is documented; never labeled depth.
export function signedDistance(mask, w, h) {
  const pass = (inside) => {
    const a = new Float32Array(w * h);
    for (let i = 0; i < a.length; i++)
      a[i] = Boolean(mask[i]) === inside ? 1e6 : 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (x) a[i] = Math.min(a[i], a[i - 1] + 1);
        if (y) a[i] = Math.min(a[i], a[i - w] + 1);
        if (x && y) a[i] = Math.min(a[i], a[i - w - 1] + Math.SQRT2);
        if (x < w - 1 && y) a[i] = Math.min(a[i], a[i - w + 1] + Math.SQRT2);
      }
    for (let y = h - 1; y >= 0; y--)
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (x < w - 1) a[i] = Math.min(a[i], a[i + 1] + 1);
        if (y < h - 1) a[i] = Math.min(a[i], a[i + w] + 1);
        if (x < w - 1 && y < h - 1)
          a[i] = Math.min(a[i], a[i + w + 1] + Math.SQRT2);
        if (x && y < h - 1) a[i] = Math.min(a[i], a[i + w - 1] + Math.SQRT2);
      }
    return a;
  };
  const inside = pass(true),
    outside = pass(false);
  return inside.map((v, i) => v - outside[i]);
}
export function connectedCoverage(alpha, w, h) {
  const visited = new Uint8Array(w * h),
    queue = new Int32Array(w * h);
  let total = 0,
    largest = 0,
    count = 0;
  for (let i = 0; i < alpha.length; i++) {
    if (!alpha[i]) continue;
    total++;
    if (visited[i]) continue;
    let read = 0,
      write = 1;
    queue[0] = i;
    visited[i] = 1;
    while (read < write) {
      const k = queue[read++],
        x = k % w,
        y = Math.floor(k / w);
      const add = (n) => {
        if (alpha[n] && !visited[n]) {
          visited[n] = 1;
          queue[write++] = n;
        }
      };
      if (x > 0) add(k - 1);
      if (x < w - 1) add(k + 1);
      if (y > 0) add(k - w);
      if (y < h - 1) add(k + w);
    }
    largest = Math.max(largest, write);
    count++;
  }
  return {
    components: count,
    largest,
    total,
    ratio: total ? largest / total : 0,
  };
}
export function drawAnalysis(ctx, rig, clip, time, images, mode) {
  const [w, h] = rig.canvas,
    states = stateAt(rig, clip, time);
  ctx.clearRect(0, 0, w, h);
  if (mode === "gray" || mode === "distance") {
    for (const p of states) {
      if (!p.visible) continue;
      ctx.save();
      ctx.transform(...p.matrix);
      if (p.mesh) drawMesh(ctx, images[p.asset], p, p.bend);
      else ctx.drawImage(images[p.asset], 0, 0, ...p.size);
      ctx.restore();
    }
    const data = ctx.getImageData(0, 0, w, h);
    if (mode === "gray") {
      for (let i = 0; i < data.data.length; i += 4) {
        const y =
          0.2126 * data.data[i] +
          0.7152 * data.data[i + 1] +
          0.0722 * data.data[i + 2];
        data.data[i] = data.data[i + 1] = data.data[i + 2] = y;
      }
    } else {
      const mask = Uint8Array.from({ length: w * h }, (_, i) =>
          data.data[i * 4 + 3] > 128 ? 1 : 0,
        ),
        d = signedDistance(mask, w, h);
      for (let k = 0; k < d.length; k++) {
        const t = Math.max(-1, Math.min(1, d[k] / 32)),
          i = k * 4;
        data.data[i] = t > 0 ? 220 : Math.round(220 * (1 + t));
        data.data[i + 1] = Math.round(180 * (1 - Math.abs(t)));
        data.data[i + 2] = t < 0 ? 225 : Math.round(225 * (1 - t));
        data.data[i + 3] = 255;
      }
    }
    ctx.putImageData(data, 0, 0);
    return;
  }
  for (let i = 0; i < states.length; i++) {
    const p = states[i];
    if (!p.visible) continue;
    ctx.save();
    ctx.transform(...p.matrix);
    if (p.mesh) drawMesh(ctx, images[p.asset], p, p.bend);
    else ctx.drawImage(images[p.asset], 0, 0, ...p.size);
    ctx.globalCompositeOperation = "source-atop"; // use isolated part buffer to avoid tinting previously drawn layers
    ctx.restore();
  }
  // Resolve visible ownership into numeric IDs; each mask still exists in the rig.
  const ids = new Uint16Array(w * h),
    z = new Float32Array(w * h);
  const scratch = ctx.canvas.ownerDocument
    ? ctx.canvas.ownerDocument.createElement("canvas")
    : null;
  if (!scratch) return;
  scratch.width = w;
  scratch.height = h;
  const sc = scratch.getContext("2d");
  for (let i = 0; i < states.length; i++) {
    const p = states[i];
    if (!p.visible) continue;
    sc.clearRect(0, 0, w, h);
    sc.save();
    sc.transform(...p.matrix);
    if (p.mesh) drawMesh(sc, images[p.asset], p, p.bend);
    else sc.drawImage(images[p.asset], 0, 0, ...p.size);
    sc.restore();
    const a = sc.getImageData(0, 0, w, h).data;
    for (let k = 0; k < ids.length; k++)
      if (a[k * 4 + 3] > 128) {
        ids[k] = i + 1;
        z[k] = p.z;
      }
  }
  const maxZ = Math.max(1, ...states.map((p) => p.z));
  const data = ctx.createImageData(w, h);
  for (let k = 0; k < ids.length; k++) {
    if (!ids[k]) continue;
    const v = mode === "order" ? z[k] / maxZ : (ids[k] * 0.61803398875) % 1;
    const color =
      mode === "order"
        ? [60 + 130 * v, 40 + 180 * v, 180 - 130 * v]
        : [
            128 + 100 * Math.sin(v * 6.28),
            128 + 100 * Math.sin(v * 6.28 + 2.1),
            128 + 100 * Math.sin(v * 6.28 + 4.2),
          ];
    data.data.set([...color, 255], k * 4);
  }
  ctx.putImageData(data, 0, 0);
}
