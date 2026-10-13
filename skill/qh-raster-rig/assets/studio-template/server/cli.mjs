#!/usr/bin/env node
import fs from "node:fs/promises";
import { project } from "./store.mjs";
import {
  generate,
  quality,
  exportClip,
  checkedSave,
  prepareGeneration,
  importAsset,
} from "./service.mjs";
const [cmd, character = "fox", arg = "hello", option = "24"] =
  process.argv.slice(2);
let result;
switch (cmd) {
  case "inspect":
    result = project(character);
    break;
  case "generate":
    result = await generate(character, arg, Number(option), 2, 95);
    break;
  case "quality":
    result = await quality(character, arg);
    break;
  case "export":
    result = { file: await exportClip(character, arg, option) };
    break;
  case "save": {
    const doc = JSON.parse(await fs.readFile(arg, "utf8")),
      p = project(character);
    result = checkedSave(character, doc, p.revision);
    break;
  }
  case "prepare":
    result = prepareGeneration(character, arg, Number(option));
    break;
  case "import-asset":
    result = await importAsset(
      character,
      arg,
      (await fs.readFile(option)).toString("base64"),
    );
    break;
  default:
    console.log(
      "Commands: inspect CHARACTER | generate CHARACTER MOTION FPS | quality CHARACTER CLIP | export CHARACTER CLIP json/gif/mp4/frames | save CHARACTER project.json | prepare CHARACTER ACTION FPS | import-asset CHARACTER NAME file.png",
    );
    process.exit(0);
}
console.log(JSON.stringify(result, null, 2));
