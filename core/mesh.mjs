export function deformPoint(part, p, bend = 0) {
  const axis = part.mesh?.axis || "y";
  const d =
    axis === "y"
      ? Math.max(
          0,
          (p[1] - part.pivot[1]) / Math.max(1, part.size[1] - part.pivot[1]),
        )
      : Math.max(0, (part.pivot[0] - p[0]) / Math.max(1, part.pivot[0]));
  const w = d * d * (3 - 2 * d);
  return axis === "y" ? [p[0] + bend * w, p[1]] : [p[0], p[1] + bend * w];
}
// Small texture mesh; deformation is in local asset pixels, independent of viewport.
export function vertices(part, bend = 0) {
  const columns = part.mesh?.columns || 4,
    rows = part.mesh?.rows || 6;
  const [w, h] = part.size,
    verts = [];
  for (let y = 0; y <= rows; y++)
    for (let x = 0; x <= columns; x++) {
      const px = (x * w) / columns,
        py = (y * h) / rows;
      const axis = part.mesh?.axis || "y";
      const distance =
        axis === "y"
          ? Math.max(0, (py - part.pivot[1]) / Math.max(1, h - part.pivot[1]))
          : Math.max(0, (part.pivot[0] - px) / Math.max(1, part.pivot[0]));
      const weight = distance * distance * (3 - 2 * distance);
      verts.push({
        source: [px, py],
        target:
          axis === "y" ? [px + bend * weight, py] : [px, py + bend * weight],
        weight,
      });
    }
  return verts;
}
export function triangles(part) {
  const c = part.mesh?.columns || 4,
    r = part.mesh?.rows || 6,
    out = [];
  for (let y = 0; y < r; y++)
    for (let x = 0; x < c; x++) {
      const a = y * (c + 1) + x,
        b = a + 1,
        d = a + c + 1,
        e = d + 1;
      out.push([a, b, e], [a, e, d]);
    }
  return out;
}
export function triangleMatrix(src, dst) {
  const [a, b, c] = src,
    [d, e, f] = dst;
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    vx = c[0] - a[0],
    vy = c[1] - a[1],
    det = ux * vy - vx * uy;
  if (Math.abs(det) < 1e-9) throw Error("Degenerate source triangle");
  const du = [e[0] - d[0], e[1] - d[1]],
    dv = [f[0] - d[0], f[1] - d[1]];
  const A = (du[0] * vy - dv[0] * uy) / det,
    B = (du[1] * vy - dv[1] * uy) / det,
    C = (dv[0] * ux - du[0] * vx) / det,
    D = (dv[1] * ux - du[1] * vx) / det;
  return [A, B, C, D, d[0] - A * a[0] - C * a[1], d[1] - B * a[0] - D * a[1]];
}
export function meshMetrics(part, bend) {
  const v = vertices(part, bend);
  let flips = 0,
    minRatio = Infinity,
    maxRatio = 0;
  const area = ([a, b, c]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (const ids of triangles(part)) {
    const ratio =
      area(ids.map((i) => v[i].target)) / area(ids.map((i) => v[i].source));
    if (ratio <= 0) flips++;
    minRatio = Math.min(minRatio, ratio);
    maxRatio = Math.max(maxRatio, ratio);
  }
  return {
    flippedTriangles: flips,
    minAreaRatio: minRatio,
    maxAreaRatio: maxRatio,
  };
}
export function drawMesh(ctx, img, part, bend, createSurface) {
  if (Math.abs(bend) < 1e-8) {
    ctx.drawImage(img, 0, 0, ...part.size);
    return;
  }
  const factory =
    createSurface ||
    (typeof OffscreenCanvas !== "undefined"
      ? (w, h) => new OffscreenCanvas(w, h)
      : null);
  const padding = Math.ceil(Math.abs(bend)) + 2,
    quality = 2;
  let surface,
    paint = ctx;
  if (factory) {
    surface = factory(
      Math.ceil((part.size[0] + 2 * padding) * quality),
      Math.ceil((part.size[1] + 2 * padding) * quality),
    );
    paint = surface.getContext("2d");
    paint.scale(quality, quality);
    paint.translate(padding, padding);
  }
  const v = vertices(part, bend);
  for (const tri of triangles(part)) {
    const src = tri.map((i) => v[i].source),
      dst = tri.map((i) => v[i].target),
      center = [
        dst.reduce((s, p) => s + p[0], 0) / 3,
        dst.reduce((s, p) => s + p[1], 0) / 3,
      ],
      clip = dst.map((p) => {
        const d = Math.hypot(p[0] - center[0], p[1] - center[1]);
        return [
          p[0] + (1.25 * (p[0] - center[0])) / d,
          p[1] + (1.25 * (p[1] - center[1])) / d,
        ];
      });
    paint.save();
    paint.beginPath();
    paint.moveTo(...clip[0]);
    paint.lineTo(...clip[1]);
    paint.lineTo(...clip[2]);
    paint.closePath();
    paint.clip();
    paint.transform(...triangleMatrix(src, dst));
    paint.drawImage(img, 0, 0, ...part.size);
    paint.restore();
  }
  if (surface)
    ctx.drawImage(
      surface,
      -padding,
      -padding,
      part.size[0] + 2 * padding,
      part.size[1] + 2 * padding,
    );
}
