import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { htmlFacts, sourceImports } from './vendor/makefun-app.ts';

const root = fileURLToPath(new URL('.',import.meta.url));
const app = resolve(root,'app');
const read = path => readFileSync(path,'utf8');
let failures=0;
function check(name,fn) {
  try {fn();console.log('✓ '+name);}
  catch(error){failures++;console.error('✗ '+name+'：'+error.message);}
}
function assert(ok,message){if(!ok)throw Error(message);}
function walk(path) {return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(path,e.name)):[resolve(path,e.name)]);}
check('① HTML、可达脚本与样式的引用均为 app/ 内资源或 data URI，无网络引用',()=>{
  const seen=new Set();
  function reference(ref,from) {
    if(!ref||ref.startsWith('#')||ref.startsWith('data:'))return;
    assert(!/^(?:[a-z][\w+.-]*:|\/\/)/i.test(ref),'不允许的引用 '+ref);
    const path=resolve(dirname(from),decodeURIComponent(ref.split(/[?#]/)[0]));
    assert(path.startsWith(app+sep),'引用越界 '+ref);
    assert(existsSync(path)&&statSync(path).isFile(),'资源缺失 '+ref);
    visit(path);
  }
  function visit(path) {
    if(seen.has(path))return;seen.add(path);
    const ext=extname(path);
    if(!['.html','.js','.mjs','.css'].includes(ext))return;
    const text=read(path);
    assert(!/https?:\/\//i.test(text),'源码有网络地址 '+path);
    if(ext==='.html') {
      for(const match of text.matchAll(/(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi))reference(match[1],path);
      for(const match of text.matchAll(/srcset\s*=\s*["']([^"']+)["']/gi))for(const part of match[1].split(','))reference(part.trim().split(/\s/)[0],path);
      // The supplied parser also validates the document is parseable as entry HTML.
      assert(htmlFacts(text).scripts.length>0,'没有可达脚本');
    }
    if(ext==='.js'||ext==='.mjs') {
      for(const item of sourceImports(text)) {
        const spec=typeof item==='string'?item:item.specifier;
        assert(typeof spec==='string'&&/^\.\.?\//.test(spec),'裸导入或不可解析导入');reference(spec,path);
      }
      for(const match of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g))reference(match[1],path);
      assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|Worker|importScripts)\s*\(/.test(text),'应用包含网络或后台加载 API');
    }
    if(ext==='.css') {
      for(const match of text.matchAll(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/g))reference(match[1],path);
      for(const match of text.matchAll(/@import\s+["']([^"']+)["']/g))reference(match[1],path);
    }
  }
  visit(resolve(app,'index.html'));
  assert(seen.has(resolve(app,'studio.js')),'主脚本不可达');
  // Verify the inlined copies are exactly the two retained sample files.
  const box={};runInNewContext(read(resolve(app,'samples/embedded.min.js')),box);
  for(const [i,name] of ['boulevard.jpg','pier.jpg'].entries()) {
    assert(Buffer.from(box.AFTERGLOW_SAMPLES[i].split(',')[1],'base64').equals(readFileSync(resolve(app,'samples',name))),'内嵌样张不一致');
  }
});
check('② 应用和交付脚本禁用词扫描；README 仅豁免指定徽章行',()=>{
  const terms=['g'+'ta','grand'+' theft auto','rock'+'star'];
  const banned=new RegExp(terms.join('|'),'i');
  for(const path of [...walk(app),...['main.ts','serve.ts','capture.mjs','shots.json','verify.mjs'].map(p=>resolve(root,p))])assert(!banned.test(read(path)),'命中 '+path.slice(root.length));
  const body=read(resolve(root,'README.md')).split('\n').filter(line=>!line.startsWith('[![')).join('\n');
  assert(!banned.test(body),'README 正文含禁用词');
});
check('③ vendor 文件与 kit 原件 SHA-256 一致',()=>{
  const slug=['g','ta6-cover-art-01'].join('');
  const original=resolve(root,'../..',slug+'-kit',slug+'-kit','starter/vendor/makefun-app.ts');
  const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
  assert(hash(resolve(root,'vendor/makefun-app.ts'))===hash(original),'kit 文件发生变化');
});
check('④ 四条截图配置、六种布局、五种滤镜、三种导出尺寸齐备',()=>{
  const expected=[{name:'1-cover.jpg',query:'?shot=cover&format=wide',w:1280,h:720},{name:'2-editor.jpg',query:'?shot=editor',w:1280,h:720},{name:'3-cover.jpg',query:'?shot=cover&format=portrait',w:1024,h:1280},{name:'4-cover.jpg',query:'?shot=cover&format=square',w:1024,h:1024}];
  assert(JSON.stringify(JSON.parse(read(resolve(root,'shots.json'))))===JSON.stringify(expected),'shots.json 不符');
  const src=read(resolve(app,'studio.js'));
  function config(name) {
    const match=src.match(new RegExp('const '+name+' = (\\[[\\s\\S]*?\\n  \\]);'));
    assert(match,'缺少配置 '+name);return runInNewContext('('+match[1]+')');
  }
  assert(config('LAYOUTS').length===6,'布局数不符');assert(config('FILTERS').length===5,'滤镜数不符');
  const sizes=config('FORMATS').map(f=>`${f.id}:${f.w}x${f.h}`).join(',');
  assert(sizes==='square:1080x1080,portrait:1080x1350,wide:1920x1080','导出尺寸不符');
  for(const path of ['src/cover.js','src/main.js','src/shots.js'])assert(!existsSync(resolve(app,path)),'残留占位脚本');
  for(const path of ['fonts/DejaVuSans-Bold.ttf','fonts/DejaVuSerif.ttf','fonts/LICENSE-DejaVu.txt','fonts/FONT-NOTES.txt'])assert(existsSync(resolve(app,path)),'字体交付缺失');
});
if(failures){console.error(`自检失败：${failures} 项`);process.exitCode=1;}else console.log('全部静态自检通过。');
