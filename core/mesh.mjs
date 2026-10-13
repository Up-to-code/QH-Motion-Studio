// Vertices and attachments share the same piecewise-linear displacement field.
// A renderer triangle cannot reproduce the continuous easing curve between rows.
function meshShape(part) {
  const columns = part.mesh?.columns ?? 4, rows = part.mesh?.rows ?? 6;
  if (!Number.isInteger(columns) || columns < 1 || columns > 64 ||
      !Number.isInteger(rows) || rows < 1 || rows > 64)
    throw Error("Mesh subdivisions must be integers from 1 to 64");
  return { columns, rows };
}
function weightAt(part, coordinate) {
  const axis = part.mesh?.axis ?? "y";
  const pivot = part.pivot[axis === "y" ? 1 : 0];
  const length = axis === "y" ? part.size[1] - pivot : pivot;
  if (length <= 0) return 0;
  const d = Math.max(0, Math.min(1, (axis === "y" ? coordinate - pivot : pivot - coordinate) / length));
  return d * d * (3 - 2 * d);
}
export function deformationJacobian(part, p, bend = 0) {
  const axis = part.mesh?.axis ?? "y", { columns, rows } = meshShape(part);
  const length = part.size[axis === "y" ? 1 : 0];
  const count = axis === "y" ? rows : columns;
  const coordinate = p[axis === "y" ? 1 : 0];
  if (coordinate < 0 || coordinate > length) return [1, 0, 0, 1, 0, 0];
  const step = length / count, cell = Math.min(count - 1, Math.floor(coordinate / step));
  const slope = bend * (weightAt(part, (cell + 1) * step) - weightAt(part, cell * step)) / step;
  return axis === "y" ? [1, 0, slope, 1, 0, 0] : [1, slope, 0, 1, 0, 0];
}
export function deformPoint(part, p, bend = 0) {
  const axis = part.mesh?.axis ?? "y", { columns, rows } = meshShape(part);
  const length = part.size[axis === "y" ? 1 : 0], count = axis === "y" ? rows : columns;
  const coordinate = Math.max(0, Math.min(length, p[axis === "y" ? 1 : 0]));
  const step = length / count, cell = Math.min(count - 1, Math.floor(coordinate / step));
  const u = (coordinate - cell * step) / step;
  const weight = weightAt(part, cell * step) * (1 - u) + weightAt(part, (cell + 1) * step) * u;
  return axis === "y" ? [p[0] + bend * weight, p[1]] : [p[0], p[1] + bend * weight];
}
// Small texture mesh; deformation is in local asset pixels, independent of viewport.
export function vertices(part, bend = 0) {
  const { columns, rows } = meshShape(part), [w, h] = part.size, verts = [];
  for (let y = 0; y <= rows; y++)
    for (let x = 0; x <= columns; x++) {
      const source = [(x * w) / columns, (y * h) / rows];
      verts.push({ source, target: deformPoint(part, source, bend), weight: weightAt(part, source[(part.mesh?.axis ?? "y") === "y" ? 1 : 0]) });
    }
  return verts;
}
export function triangles(part) {
  const { columns: c, rows: r } = meshShape(part),
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
    // Replace shared triangle pixels on the isolated layer surface. Source-over
    // counts translucent texture pixels twice along expanded seam guards.
    if (surface) paint.globalCompositeOperation = "copy";
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
