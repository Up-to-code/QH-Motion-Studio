const {chromium}=require('/Users/ahmedmansour/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
(async()=>{
 const real=process.argv.includes('--real'),browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let memory={revision:1,appearance:'orange fox',plan:'test plan',motionIntent:'wave',decisions:[],failures:[],results:[]},report={id:'ui-contract-check',character:'fox',clip:'hello-a',status:'review-required',findings:[],tasks:[{role:'skeleton',status:'passed'},{role:'artwork-review',status:'pending'}],regional:{tiles:[{id:'0-0',core:[0,0,32,32],bounds:[0,0,36,36]}]}};
 if(!real){
  await page.route('**/api/context/fox',r=>{if(r.request().method()==='PUT'){const b=r.request().postDataJSON();if(b.revision!==memory.revision)return r.fulfill({status:409,json:{error:'Context revision changed'}});memory={...memory,...b.context,revision:memory.revision+1};}return r.fulfill({json:memory});});
  await page.route('**/api/workflow',r=>r.fulfill({json:report}));
  await page.route('**/api/workflow/ui-contract-check',r=>r.fulfill({json:report}));
  await page.route('**/api/workflow/ui-contract-check/0-0',r=>r.fulfill({json:{tile:report.regional.tiles[0],findings:[],instruction:'Inspect core plus halo.'}}));
 }
 let original;if(real){original=await(await page.request.get('http://127.0.0.1:8090/api/context/fox')).json();if(original.error)throw Error(original.error);}
 await page.goto('http://127.0.0.1:8090');await page.getByRole('button',{name:'Agent tools',exact:true}).click();await page.getByText('Character context',{exact:true}).click();await page.getByRole('textbox',{name:'Plan',exact:true}).waitFor();
 const marker='Review joint attachment regions before changing artwork.';await page.getByRole('textbox',{name:'Plan',exact:true}).fill(marker);await page.getByRole('button',{name:'Save context',exact:true}).click();await page.getByText('Character context saved locally.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Inspect regions',exact:true}).click();await page.getByRole('combobox',{name:'Inspection region',exact:true}).waitFor({timeout:120000});
 const regions=page.getByRole('combobox',{name:'Inspection region',exact:true});const value=await regions.locator('option').nth(1).getAttribute('value');await regions.selectOption(value);await page.getByText(/With halo \[/).waitFor();if(real){const crop=page.locator('.region-crop');await crop.waitFor();await crop.evaluate(img=>img.decode());if(await crop.evaluate(img=>img.naturalWidth)<=0)throw Error('ROI crop failed to load');}
 await page.screenshot({path:'docs/workflow-inspector.png',fullPage:true});
 const savedId=await page.evaluate(()=>localStorage.getItem('qh-workflow-fox'));if(!savedId)throw Error('Workflow ID not persisted');
 await page.reload();await page.getByRole('button',{name:'Agent tools',exact:true}).click();await page.getByRole('combobox',{name:'Inspection region',exact:true}).waitFor();await page.getByText('Character context',{exact:true}).click();if(await page.getByRole('textbox',{name:'Plan',exact:true}).inputValue()!==marker)throw Error('Context not restored');
 if(real){const current=await(await page.request.get('http://127.0.0.1:8090/api/context/fox')).json();await page.request.put('http://127.0.0.1:8090/api/context/fox',{data:{revision:current.revision,context:{appearance:original.appearance,plan:original.plan,motionIntent:original.motionIntent}}});}
 if(errors.length)throw Error(errors.join('\n'));fs.writeFileSync('docs/workflow-ui-evidence.json',JSON.stringify({mode:real?'real API':'mocked contract',contextSavedAndRestored:true,workflowRestored:true,packetBoundsShown:true,pageErrors:errors},null,2));console.log('Workflow UI persistence checks passed ('+(real?'real API':'mocked contract')+')');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
