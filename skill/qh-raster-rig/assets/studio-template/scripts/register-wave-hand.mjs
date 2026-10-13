// Register replacement art to the same wrist in local asset pixels.
// Source art is preserved. No body/root joint is moved to accommodate a pose.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs/promises';
const image = await loadImage('public/animations/fox/parts/hand_wave.png');
const canvas = createCanvas(35,44), ctx = canvas.getContext('2d');
ctx.translate(17.5,9);
ctx.rotate(Math.PI);
ctx.scale(.155,.155);
ctx.translate(-124,-214);
ctx.drawImage(image,0,0);
await fs.writeFile('public/animations/fox/parts/hand_wave_registered.png',canvas.toBuffer('image/png'));
