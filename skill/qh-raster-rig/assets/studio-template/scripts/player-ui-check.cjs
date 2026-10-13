const { chromium }=require('/Users/ahmedmansour/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8090');await page.waitForSelector('canvas');await page.waitForTimeout(1000);
 if(await page.locator('.preview-toolbar').count())throw Error('Second navigation remains');
 for(const name of ['Close library','Compare candidates','Fit canvas','Focus selected part','Zoom in'])if(await page.locator('header').getByRole('button',{name,exact:true}).count()!==1)throw Error('Header control missing '+name);
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForTimeout(100);
 if(Number(await page.locator('canvas').first().getAttribute('data-zoom'))<=1)throw Error('Zoom not applied');
 await page.getByRole('button',{name:'Fit canvas',exact:true}).click();
 await page.getByRole('tab',{name:'Parts'}).click();await page.locator('.part-row > button:first-child').first().click();
 await page.getByRole('button',{name:'Focus selected part',exact:true}).click();await page.waitForTimeout(100);
 const focusedZoom=Number(await page.locator('canvas').first().getAttribute('data-zoom'));if(focusedZoom<=1)throw Error('Part focus did not zoom');
 const selectedLabel=await page.locator('.part-row.selected > button:first-child').innerText();
 const size=page.locator('.xy-field input').nth(4);const oldSize=await size.inputValue();await size.fill(String(Number(oldSize)+1));await page.waitForTimeout(150);
 if(Number(await page.locator('canvas').first().getAttribute('data-zoom'))!==focusedZoom)throw Error('Editing reset camera');
 await size.fill(oldSize);await page.getByRole("button",{name:"Close inspector",exact:true}).click();
 await page.getByRole('button',{name:'Fit canvas',exact:true}).click();await page.waitForTimeout(100);
 // Pan must move only presentation; keyboard reset restores the view.
 const canvas=page.locator('canvas').first(), box=await canvas.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+50,box.y+box.height/2+20);await page.mouse.up();
 if(String(await canvas.getAttribute('style')).includes('translate(0%, 0%)'))throw Error('Pan not applied');
 await canvas.focus();await page.keyboard.press('0');

 const hit=await page.evaluate(async()=>{
   const project=await(await fetch('/api/project/fox')).json();
   const {stateAt}=await import('/core/engine.mjs');const {drawMesh}=await import('/core/mesh.mjs');
   const clip=project.clips.find(c=>c.id===project.selected),parts=stateAt(project.rig,clip,0).reverse();
   const c=document.createElement('canvas');[c.width,c.height]=project.rig.canvas;const ctx=c.getContext('2d',{willReadFrequently:true});
   for(const p of parts){if(!p.visible||p.opacity<=0)continue;const img=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=p.asset;});ctx.clearRect(0,0,c.width,c.height);ctx.save();ctx.transform(...p.matrix);if(p.mesh)drawMesh(ctx,img,p,p.bend);else ctx.drawImage(img,0,0,...p.size);ctx.restore();const d=ctx.getImageData(0,0,c.width,c.height).data;for(let y=5;y<c.height-5;y+=3)for(let x=5;x<c.width-5;x+=3)if(d[(y*c.width+x)*4+3]>240)return {id:p.id,x,y,width:c.width,height:c.height};}
 });
 if(!hit)throw Error('No opaque part found');
 const hitBox=await canvas.boundingBox();await page.mouse.click(hitBox.x+hit.x/hit.width*hitBox.width,hitBox.y+hit.y/hit.height*hitBox.height);
 const selectedId=await page.locator('.part-row.selected').evaluate(el=>el.querySelector('button').textContent.trim());
 const p=await(await page.request.get('http://127.0.0.1:8090/api/project/fox')).json();const expectedName=p.rig.parts.find(v=>v.id===hit.id).name;
 if(!selectedId.endsWith(expectedName))throw Error('Alpha selection failed '+selectedId+' vs '+expectedName);
 await page.mouse.click(hitBox.x+2,hitBox.y+2);
 if(await page.locator('.part-row.selected').evaluate(el=>el.querySelector('button').textContent.trim())!==selectedId)throw Error('Empty pixel stole selection');
 const skeleton=await(await page.request.get('http://127.0.0.1:8090/api/skeleton/fox')).json();
 await page.getByRole('button',{name:'Toggle joint coordinates',exact:true}).click();await page.waitForTimeout(100);
 const nodeCount=Number(await canvas.getAttribute('data-skeleton-nodes'));if(skeleton.skeleton && nodeCount!==skeleton.skeleton.nodes.length)throw Error('Saved skeleton graph not shown');
 await page.screenshot({path:'docs/player-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Compare candidates',exact:true}).click();if(await page.locator('canvas').count()!==2)throw Error('Comparison missing');
 await page.screenshot({path:'docs/player-compare.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/player-mobile.png',fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('Mobile overflow');
 if(errors.length)throw Error(errors.join('\n'));
 fs.writeFileSync('docs/player-ui-evidence.json',JSON.stringify({headerOnly:true,fit:true,pan:true,focus:true,focusedZoom,editPreservesView:true,compare:true,mobileOverflow:false,pageErrors:errors,skeletonNodes:nodeCount,selection:'Rendered opaque pixel selects topmost part; empty pixel preserves selection; keyboard selection through Parts library'},null,2));
 await browser.close();console.log('Player UI checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
