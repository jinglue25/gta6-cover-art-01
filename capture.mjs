import { chromium } from '/home/hatch/workspace/makefun/tools/pw/node_modules/playwright-core/index.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

// In-process static HTTP responder: Playwright delivers local files without sockets.
const root=resolve('app');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.jpg':'image/jpeg','.txt':'text/plain'};
const routed=process.argv.includes('--routed');
let base='http://afterglow.local';
let server;
if(!routed){
  server=createServer(async(req,res)=>{
    const u=new URL(req.url,base),path=resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
    if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    try{res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream'}).end(await readFile(path));}catch{res.writeHead(404).end();}
  });
  await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
  base='http://127.0.0.1:'+server.address().port;
}
let browser;
try{
  browser=await chromium.launch({executablePath:'/home/hatch/workspace/makefun/tools/pw/browsers/chrome-headless-shell/linux-157.0.8103.78/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu-sandbox','--no-zygote','--single-process']});
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());requests.push(url.href);
    if(url.origin!==base){await route.abort();throw new Error('External request: '+url.href);}
    if(!routed){await route.continue();return;}
    const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    assert.ok(path.startsWith(root+sep));
    await route.fulfill({status:200,contentType:mime[extname(path)]??'application/octet-stream',body:await readFile(path)});
  });
  async function open(query){await page.goto(base+'/'+query);await page.waitForSelector('body[data-ready="true"]');await page.evaluate(()=>document.fonts.ready);}
  await open('?shot=editor');
  assert.equal(await page.locator('.layout-button').count(),6);
  assert.equal(await page.locator('.filter').count(),5);
  for(const layout of ['grid','hero','full','split','snap','cinema']){await page.locator(`[data-id="${layout}"]`).click();}
  for(const filter of ['neon','gold','candy','mono','sunset']){await page.locator(`[data-id="${filter}"]`).click();}
  await page.locator('#title').fill('TEST COVER');
  await page.locator('#subtitle').fill('Test signature');
  await page.locator('#undo').click();assert.equal(await page.locator('#subtitle').inputValue(),'A little trouble in paradise');
  await page.locator('#redo').click();assert.equal(await page.locator('#subtitle').inputValue(),'Test signature');
  for(const format of ['square','portrait','wide']){await page.selectOption('#format',format);const size=await page.locator('canvas').evaluate(c=>[c.width,c.height]);assert.deepEqual(size,{square:[1080,1080],portrait:[1080,1350],wide:[1920,1080]}[format]);}
  const box=await page.locator('canvas').boundingBox();await page.mouse.move(box.x+box.width*.3,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.35,box.y+box.height*.35);await page.mouse.up();
  await page.locator('#zoom').evaluate(el=>{el.dispatchEvent(new Event('pointerdown',{bubbles:true}));el.value='1.5';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#reset').click();assert.equal(await page.locator('#zoom').inputValue(),'1');
  await page.setInputFiles('#upload',['app/samples/boulevard.jpg','app/samples/pier.jpg']);await page.waitForFunction(()=>document.querySelectorAll('.photo').length===4);
  await page.locator('#fill').click();
  const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;await download.saveAs('/tmp/afterglow-test.png');
  await page.locator('#dropzone').dispatchEvent('drop',{dataTransfer:await page.evaluateHandle(async()=>{const r=await fetch('./samples/pier.jpg');const b=await r.blob();const d=new DataTransfer();d.items.add(new File([b],'dropped.jpg',{type:'image/jpeg'}));return d;})});
  await page.waitForFunction(()=>document.querySelectorAll('.photo').length===5);
  console.log('PASS: 6 layouts, 5 filters, title/subtitle, undo/redo, 3 formats, crop, zoom/reset, multi-upload, drag/drop, fill, PNG download');
  await mkdir('screenshots',{recursive:true});
  const shots=JSON.parse(await readFile('shots.json','utf8'));
  for(const {name,query,w,h}of shots){await page.setViewportSize({width:w,height:h});await open(query);let bytes;for(const quality of [85,75,65,55,45]){bytes=await page.screenshot({path:'screenshots/'+name,type:'jpeg',quality});if(bytes.length<=262144)break;}assert.ok(bytes.length<=262144);console.log('Captured',name,w,h,bytes.length,'bytes');}
  await page.setViewportSize({width:390,height:844});await open('?shot=editor');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);console.log('PASS: mobile has no horizontal overflow');
  assert.deepEqual(errors,[]);console.log('PASS: no browser errors; all',requests.length,'resource requests served locally');
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));}
