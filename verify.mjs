import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';

const root=resolve('app');
async function walk(dir){const paths=[];for(const name of (await readdir(dir)).sort()){const p=resolve(dir,name);if((await stat(p)).isDirectory())paths.push(...await walk(p));else paths.push(p);}return paths;}
const files=await walk(root);
for(const file of files){if(!/\.(html|css|js|txt)$/.test(file))continue;const text=await readFile(file,'utf8');assert.ok(!/https?:\/\//i.test(text),'External URL in '+file);assert.ok(!/\b(?:GTA|Grand Theft Auto|Rockstar)\b/i.test(text),'Forbidden content in '+file);if(/\.(html|css)$/.test(file)){const refs=[...text.matchAll(/(?:src|href)=["']([^"']+)|url\(["']?([^)'"\s]+)/g)].map(m=>m[1]??m[2]);for(const ref of refs){if(ref.startsWith('data:'))continue;assert.ok(ref.startsWith('./'),'Nonrelative ref '+ref);await stat(resolve(dirname(file),ref));}}}
const vendorHash=createHash('sha256').update(await readFile('vendor/makefun-app.ts')).digest('hex');
assert.equal(vendorHash,'14e650adbd6aff7fb760e9bcd7be00dfbe86fb4819afe88dfe23dd0e087e770e');
assert.deepEqual(JSON.parse(await readFile('.makefun/owner.json','utf8')),{wallet:'9S7du7QkRzPUnwYLzTmRcuVPsGGtFriUbh6KfBU9zhYm'});
console.log('PASS: local asset references, prohibited text scan, unchanged vendor SHA-256, owner');

// Exercise the real editor state logic with a small DOM/canvas test double.
// This verifies interactions and drawing arguments, not pixels or browser compatibility.
const elements=new Map(),created=[],draws=[];
const gradient={addColorStop(){}};
const drawing=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,createPattern:()=>({}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),measureText:t=>({width:t.length*100}),drawImage:(image,...args)=>{assert.ok(args.every(Number.isFinite));draws.push(args);}}, {get:(target,key)=>key in target?target[key]:(()=>{}),set:(target,key,value)=>{target[key]=value;return true;}});
class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.style={};this.dataset={};this.value='';this.className='';this.classList={contains:c=>this.className.split(' ').includes(c),add:c=>{this.className+=' '+c;},toggle:(c,on)=>{const s=new Set(this.className.split(' '));on?s.add(c):s.delete(c);this.className=[...s].join(' ');}};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(k,v){this[k]=v;}
  addEventListener(){}
  getContext(){return drawing;}
  setPointerCapture(){}
  getBoundingClientRect(){return{x:0,y:0,left:0,top:0,width:1000,height:600};}
}
const get=id=>{if(!elements.has(id))elements.set(id,new Element(id==='poster'?'canvas':'div'));return elements.get(id);};
const body=new Element();
const document={body,activeElement:new Element(),getElementById:get,createElement:tag=>{const e=new Element(tag);created.push(e);return e;},querySelector:()=>get('frame'),querySelectorAll:selector=>created.filter(e=>e.className.split(' ').includes(selector.slice(1))),addEventListener(){},fonts:{load:async()=>[]}};
class LocalImage{constructor(){this.width=720;this.height=720;}set src(v){this._src=v;if(v.includes('boulevard')){this.width=544;this.height=720;}}get src(){return this._src;}async decode(){}}
const context=vm.createContext({document,Image:LocalImage,URLSearchParams,location:{search:''},console,setTimeout:()=>0,clearTimeout(){},URL:{createObjectURL:()=> 'blob:local-test',revokeObjectURL(){}},Uint8ClampedArray});
vm.runInContext(await readFile('app/studio.js','utf8'),context);
await new Promise(r=>setImmediate(r));
assert.equal(body.dataset.ready,'true');
const evaluate=code=>vm.runInContext(code,context);
for(const [layout,count]of [['cinema',4],['grid',9],['hero',4],['full',1],['split',2],['snap',3]]){evaluate(`change(()=>state.layout='${layout}')`);assert.equal(evaluate('geometry().length'),count);}
for(const format of ['wide','portrait','square']){evaluate(`change(()=>state.format='${format}')`);assert.equal(get('poster').width,{wide:1920,portrait:1080,square:1080}[format]);assert.equal(get('poster').height,{wide:1080,portrait:1350,square:1080}[format]);}
evaluate("change(()=>state.title='BEFORE');change(()=>state.title='AFTER');undo()");assert.equal(evaluate('state.title'),'BEFORE');evaluate('redo()');assert.equal(evaluate('state.title'),'AFTER');
for(const filter of ['sunset','neon','gold','candy','mono'])evaluate(`change(()=>state.filter='${filter}')`);
for(const effect of ['grain','vignette','halftone'])evaluate(`change(()=>state.${effect}=!state.${effect})`);
evaluate("selected=0;state.panels[0].zoom=2;state.panels[0].x=.3;state.panels[0].y=-.2");get('reset').onclick();assert.equal(evaluate('state.panels[0].zoom'),1);assert.equal(evaluate('state.panels[0].x'),0);
evaluate('activePhoto=1');get('fill').onclick();assert.equal(evaluate('state.panels.every(p=>p.photo===1)'),true);
await evaluate("upload([{type:'image/jpeg',name:'upload-1.jpg'},{type:'image/png',name:'upload-2.png'}])");assert.equal(evaluate('photos.length'),4);
assert.ok(draws.length>30);
console.log('PASS: editor state logic — layouts, formats, filters, effects, undo/redo, crop reset, fill, multi-file import');
console.log('LIMIT: DOM/canvas doubles do not verify browser rendering or screenshot appearance.');
