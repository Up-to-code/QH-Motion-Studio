import fs from "node:fs/promises";
import path from "node:path";
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc = (buffer) => {
  let c = 0xffffffff;
  for (const b of buffer) c = table[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
export async function zipDirectory(dir, file) {
  const entries = [];
  async function walk(folder, prefix = "") {
    for (const name of (await fs.readdir(folder)).sort()) {
      const f = path.join(folder, name),
        id = prefix + name;
      const st = await fs.stat(f);
      if (st.isDirectory()) await walk(f, id + "/");
      else entries.push({ name: id, data: await fs.readFile(f) });
    }
  }
  await walk(dir);
  let offset = 0;
  const local = [],
    central = [];
  for (const e of entries) {
    const name = Buffer.from(e.name),
      hash = crc(e.data),
      h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x800, 6);
    h.writeUInt16LE(33, 12);
    h.writeUInt32LE(hash, 14);
    h.writeUInt32LE(e.data.length, 18);
    h.writeUInt32LE(e.data.length, 22);
    h.writeUInt16LE(name.length, 26);
    local.push(h, name, e.data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8);
    c.writeUInt16LE(33, 14);
    c.writeUInt32LE(hash, 16);
    c.writeUInt32LE(e.data.length, 20);
    c.writeUInt32LE(e.data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += h.length + name.length + e.data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  await fs.writeFile(file, Buffer.concat([...local, directory, end]));
  return file;
}
