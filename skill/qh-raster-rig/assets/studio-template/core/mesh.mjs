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
// Inverse sampling gives every destination pixel exactly one texture sample.
// Expanded triangle clips corrupt detailed art at their shared edges in browsers.
const rasterSources = new WeakMap();
export function drawMesh(ctx, img, part, bend, createSurface) {
  if (Math.abs(bend) < 1e-8) {
    ctx.drawImage(img, 0, 0, ...part.size);
    return;
  }
  const factory = createSurface ||
    (typeof OffscreenCanvas !== "undefined" ? (w, h) => new OffscreenCanvas(w, h) :
      ctx.canvas.ownerDocument ? (w, h) => {
        const c = ctx.canvas.ownerDocument.createElement("canvas"); c.width = w; c.height = h; return c;
      } : null);
  if (!factory) throw Error("Mesh rendering requires a canvas surface factory");
  const quality = 2, padding = Math.ceil(Math.abs(bend)) + 2;
  const sw = Math.ceil(part.size[0] * quality), sh = Math.ceil(part.size[1] * quality);
  const sourceKey = `${sw}:${sh}`;
  // Loaded images are immutable. Canvas sources may be painted between calls.
  let source = rasterSources.get(img);
  if (!source || source.key !== sourceKey || typeof img.getContext === "function") {
    const c = factory(sw, sh), paint = c.getContext("2d");
    paint.drawImage(img, 0, 0, sw, sh);
    source = { key: sourceKey, data: paint.getImageData(0, 0, sw, sh).data };
    rasterSources.set(img, source);
  }
  const width = Math.ceil((part.size[0] + 2 * padding) * quality);
  const height = Math.ceil((part.size[1] + 2 * padding) * quality);
  const surface = factory(width, height), paint = surface.getContext("2d");
  const output = paint.createImageData(width, height), data = source.data;
  const axisY = (part.mesh?.axis ?? "y") === "y";
  const offsets = Array.from({ length: axisY ? height : width }, (_, i) => {
    const coordinate = (i + .5) / quality - padding;
    const p = axisY ? [0, coordinate] : [coordinate, 0];
    return deformPoint(part, p, bend)[axisY ? 0 : 1];
  });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    // The unchanged axis makes this shear analytically invertible, even at bends.
    const localX = (x + .5) / quality - padding - (axisY ? offsets[y] : 0);
    const localY = (y + .5) / quality - padding - (axisY ? 0 : offsets[x]);
    const sx = localX * sw / part.size[0] - .5, sy = localY * sh / part.size[1] - .5;
    const ix = Math.floor(sx), iy = Math.floor(sy), u = sx - ix, v = sy - iy;
    let alpha = 0, red = 0, green = 0, blue = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const px = ix + dx, py = iy + dy;
      if (px < 0 || py < 0 || px >= sw || py >= sh) continue;
      const index = (py * sw + px) * 4;
      const a = data[index + 3] * (dx ? u : 1-u) * (dy ? v : 1-v);
      alpha += a; red += data[index] * a; green += data[index+1] * a; blue += data[index+2] * a;
    }
    if (alpha > 0) {
      const index = (y * width + x) * 4;
      output.data[index] = red / alpha; output.data[index+1] = green / alpha;
      output.data[index+2] = blue / alpha; output.data[index+3] = alpha;
    }
  }
  paint.putImageData(output, 0, 0);
  ctx.drawImage(surface, -padding, -padding, width / quality, height / quality);
}
