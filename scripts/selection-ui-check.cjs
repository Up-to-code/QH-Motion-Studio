const {chromium}=require('/Users/ahmedmansour/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8090');await page.waitForSelector('canvas');await page.waitForTimeout(700);
 await page.getByRole('tab',{name:'Parts'}).click();
 const scrub=page.getByRole('slider',{name:'Scrub animation time'});await scrub.focus();await page.keyboard.press('Home');
 for(let i=0;i<31;i++)await page.keyboard.press('ArrowRight');
 const canvas=page.locator('canvas').first();
 const target=await page.evaluate(async()=>{
  const p=await(await fetch('/api/project/fox')).json(),{stateAt}=await import('/core/engine.mjs'),{drawMesh}=await import('/core/mesh.mjs');
  const t=Number(document.querySelector('.scrubber').value),clip=p.clips.find(c=>c.id===p.selected),parts=stateAt(p.rig,clip,t);
  const owner=new Array(512*512),c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d',{willReadFrequently:true});
  for(const part of parts){if(!part.visible||part.opacity<=0)continue;const img=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=part.asset;});ctx.clearRect(0,0,512,512);ctx.save();ctx.transform(...part.matrix);ctx.globalAlpha=part.opacity;if(part.mesh)drawMesh(ctx,img,part,part.bend);else ctx.drawImage(img,0,0,...part.size);ctx.restore();const d=ctx.getImageData(0,0,512,512).data;for(let i=0;i<owner.length;i++)if(d[i*4+3]>16)owner[i]=part.id;}
  for(let y=2;y<510;y++)for(let x=2;x<510;x++)if([0,1,-1,512,-512].every(d=>owner[y*512+x+d]==='hand_right'))return{x,y,t};
  throw Error('No exposed hand pixel');
 });
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 const box=await canvas.boundingBox();await page.mouse.move(box.x+256/512*box.width,box.y+256/512*box.height);await page.mouse.down();await page.mouse.move(box.x+256/512*box.width-30,box.y+256/512*box.height+15);await page.mouse.up();
 const moved=await canvas.boundingBox();await page.mouse.click(moved.x+(target.x+.5)/512*moved.width,moved.y+(target.y+.5)/512*moved.height);
 const selected=await page.locator('.part-row.selected > button:first-child').innerText();if(!selected.endsWith('Hand Right'))throw Error('Wrong animated/panned selection: '+selected);
 await page.getByRole('button',{name:'Fit canvas',exact:true}).click();await page.getByRole('button',{name:'Play animation',exact:true}).click();
 const b=await canvas.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
 await page.getByRole('button',{name:'Play animation',exact:true}).waitFor();const stopped=await scrub.inputValue();await page.waitForTimeout(150);if(await scrub.inputValue()!==stopped)throw Error('Playback moved during pointer inspection');await page.mouse.up();
 await page.screenshot({path:'docs/selection-fix.png',fullPage:true});if(errors.length)throw Error(errors.join('\n'));
 fs.writeFileSync('docs/selection-fix-evidence.json',JSON.stringify({animatedHandSelection:true,zoomed:true,panned:true,pointerDownPausesPlayback:true,frameStableDuringClick:true,target,pageErrors:errors},null,2));
 await browser.close();console.log('Animated selection checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
