import assert from 'node:assert/strict';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('/home/hatch/workspace/makefun/tools/pw/node_modules/playwright-core');
const root = fileURLToPath(new URL('.', import.meta.url));
const appRoot = resolve(root, 'app');
const browserRoot = '/home/hatch/workspace/makefun/tools/pw/browsers';
async function executable(dir) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path = resolve(dir, entry.name);
    if (entry.isFile() && entry.name === 'chrome-headless-shell') return path;
    if (entry.isDirectory()) { const result = await executable(path); if (result) return result; }
  }
}
const executablePath = await executable(browserRoot);
assert.ok(executablePath, '找不到 chrome-headless-shell');
const shots = JSON.parse(await readFile(resolve(root, 'shots.json'), 'utf8'));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const errors = [], requests = [];
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.ttf':'font/ttf', '.jpg':'image/jpeg', '.png':'image/png' };
try {
  const context = await browser.newContext({ viewport: { width:1280, height:720 }, deviceScaleFactor:1, locale:'zh-CN', reducedMotion:'reduce', serviceWorkers:'block', acceptDownloads:true });
  // A synthetic origin exists only for routing. No server, socket or TCP listener.
  const origin = 'http://afterglow.local';
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { requests.push(url.href); await route.abort(); return; }
    try {
      const pathname = decodeURIComponent(url.pathname);
      const file = resolve(appRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
      assert.ok(file.startsWith(appRoot + sep));
      await route.fulfill({ status:200, contentType:mime[extname(file)] ?? 'application/octet-stream', body:await readFile(file) });
    } catch { requests.push(url.href); await route.fulfill({ status:404, body:'Not found' }); }
  });
  const page = await context.newPage();
  page.on('pageerror', e=>errors.push(e.message));
  async function open(query, w=1280, h=720) {
    await page.setViewportSize({ width:w, height:h });
    await page.goto(origin + '/index.html' + query);
    await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');
    await page.evaluate(()=>document.fonts.ready);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  }
  await open('?shot=editor');
  assert.equal(await page.locator('#photos .photo').count(), 2, '两张样张已载入');
  assert.ok(await page.locator('#photos img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));
  assert.equal(await page.locator('#layouts button').count(), 6);
  assert.equal(await page.locator('#filters button').count(), 5);
  for (const id of ['grid','hero','full','diptych','snapshots','city']) {
    await page.locator(`#layouts [data-id="${id}"]`).click();
    assert.equal(await page.locator(`#layouts [data-id="${id}"]`).getAttribute('aria-pressed'), 'true');
  }
  console.log('通过：样张载入、六种布局切换、五种滤镜');
  for (const [id,w,h] of [['square',1080,1080],['portrait',1080,1350],['wide',1920,1080]]) {
    await page.locator(`#formats [data-id="${id}"]`).click();
    await page.waitForFunction(([w,h])=>{const c=document.getElementById('cover');return c.width===w&&c.height===h;}, [w,h]);
    const downloadPromise=page.waitForEvent('download');
    await page.locator('#export').click();
    const download=await downloadPromise;
    assert.equal(download.suggestedFilename(),`afterglow-${id}.png`);
    const bytes=await readFile(await download.path());
    assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16),w);assert.equal(bytes.readUInt32BE(20),h);
  }
  console.log('通过：三种尺寸均可导出有效 PNG');
  await open('?shot=editor',390,844);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), '390px 编辑器没有横向溢出');
  console.log('通过：390px 窄屏宽度');
  // Check every screenshot mode before writing any image.
  for (const shot of shots) {
    await open(shot.query,shot.w,shot.h);
    assert.ok(await page.locator('#cover').isVisible());
    const facts=await page.locator('#cover').evaluate(c=>({w:c.width,h:c.height,ink:c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data[3]}));
    assert.equal(facts.ink,255);
    const format=shot.query.includes('format=wide')?[1920,1080]:shot.query.includes('format=square')?[1080,1080]:[1080,1350];
    assert.deepEqual([facts.w,facts.h],format);
    assert.equal(await page.locator('.topbar').isVisible(),shot.query==='?shot=editor');
  }
  assert.deepEqual(errors,[],'没有脚本错误');assert.deepEqual(requests,[],'全部资源由 app/ 磁盘路由响应');
  console.log('通过：四种截图模式渲染');
  await mkdir(resolve(root,'screenshots'),{recursive:true});
  for (const shot of shots) {
    await open(shot.query,shot.w,shot.h);
    await page.screenshot({ path:resolve(root,'screenshots',shot.name),type:'jpeg',quality:85,fullPage:false,animations:'disabled' });
    console.log(`已截取 ${shot.name} · ${shot.w}×${shot.h}`);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  await context.close();
} finally { await browser.close(); }
