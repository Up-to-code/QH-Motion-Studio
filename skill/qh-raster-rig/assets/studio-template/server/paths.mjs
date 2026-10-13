import path from "node:path";
import { fileURLToPath } from "node:url";
export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const PUBLIC = path.join(ROOT, "public");
export const LOCAL = path.resolve(
  process.env.QH_DATA_DIR || path.join(ROOT, ".local"),
);
export function assetPath(url) {
  if (
    typeof url !== "string" ||
    !/^\/animations\/[a-z0-9_\-/]+\.png$/.test(url) ||
    url.includes("..")
  )
    throw Error("Unsafe asset path");
  return path.join(PUBLIC, url);
}
export function safeId(id) {
  if (!/^[a-z0-9_-]{1,80}$/.test(id)) throw Error("Unsafe id");
  return id;
}
