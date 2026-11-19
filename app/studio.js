/* Afterglow: a self-contained canvas compositor. No dependencies or remote assets. */
const $ = id => document.getElementById(id);
const canvas = $('poster');
const ctx = canvas.getContext('2d');
const sizes = { wide: [1920, 1080], portrait: [1080, 1350], square: [1080, 1080] };
const layouts = [
  { id: 'cinema', name: 'City story', count: 4, columns: '2fr 1fr', rows: '1fr 1fr' },
  { id: 'grid', name: 'Nine lives', count: 9, columns: '1fr 1fr 1fr', rows: '1fr 1fr 1fr' },
  { id: 'hero', name: 'The headline', count: 4, columns: '2fr 1fr 1fr', rows: '2fr 1fr' },
  { id: 'full', name: 'Full frame', count: 1, columns: '1fr', rows: '1fr' },
  { id: 'split', name: 'Double take', count: 2, columns: '1fr 1fr', rows: '1fr' },
  { id: 'snap', name: 'After hours', count: 3, columns: '1fr 1fr 1fr', rows: '1fr' }
];
const filters = [
  { id: 'sunset', name: 'Sunset', css: 'saturate(1.3) contrast(1.12) sepia(.12)', colors: ['#ee65a9','#ffb967'], overlay: ['#df4f983d','#ef7b2529'] },
  { id: 'neon', name: 'Neon', css: 'saturate(1.65) contrast(1.23) brightness(.85)', colors: ['#7c35d0','#fc5baf'], overlay: ['#3b126c65','#c3206633'] },
  { id: 'gold', name: 'Golden', css: 'sepia(.35) saturate(1.3) contrast(1.12)', colors: ['#b76b32','#ffe6a1'], overlay: ['#ffca7920','#e182222e'] },
  { id: 'candy', name: 'Teal / pink', css: 'saturate(1.2) contrast(1.18)', colors: ['#43c3c6','#ed8bb5'], overlay: ['#50c7cf33','#e154b94a'] },
  { id: 'mono', name: 'Mono', css: 'grayscale(1) contrast(1.3)', colors: ['#39323e','#ddd1e1'], overlay: ['#13101b22','#13101b33'] }
];
let state = { format:'wide', layout:'cinema', filter:'sunset', title:'VICE CITY NIGHTS', subtitle:'A little trouble in paradise', grain:true, vignette:true, halftone:false, panels:Array.from({length:9},(_,i)=>({photo:i%2,x:0,y:0,zoom:1})) };
let selected = 0, activePhoto = 0, history = [], future = [], photos = [], dragging = null, ready = false;
let texture;
const copy = () => JSON.parse(JSON.stringify(state));
function checkpoint() { history.push(copy()); if(history.length>60) history.shift(); future=[]; }
function change(fn) { checkpoint(); fn(); sync(); }
function polygon(points) { ctx.beginPath(); points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath(); }
function geometry() {
  const rect=(x,y,w,h,angle=0)=>({x,y,w,h,angle});
  if(state.layout==='full')return [rect(0,0,1,1)];
  if(state.layout==='grid')return Array.from({length:9},(_,i)=>rect(i%3/3,Math.floor(i/3)/3,1/3,1/3));
  if(state.layout==='split')return [rect(0,0,.5,1),rect(.5,0,.5,1)];
  if(state.layout==='hero')return [rect(0,0,1,.73),rect(0,.73,1/3,.27),rect(1/3,.73,1/3,.27),rect(2/3,.73,1/3,.27)];
  if(state.layout==='snap')return [rect(-.06,-.07,.66,1.12,-.065),rect(.57,-.04,.48,.56,.055),rect(.54,.53,.5,.52,-.04)];
  if(state.format==='wide')return [
    {x:0,y:0,w:.62,h:1,points:[[0,0],[.65,0],[.56,1],[0,1]]},
    {x:.61,y:0,w:.39,h:.51,points:[[.65,0],[1,0],[1,.49],[.61,.56]]},
    {x:.58,y:.5,w:.25,h:.5,points:[[.61,.56],[.83,.52],[.79,1],[.56,1]]},
    {x:.79,y:.49,w:.21,h:.51,points:[[.83,.52],[1,.49],[1,1],[.79,1]]}
  ];
  return [
    {x:0,y:0,w:.7,h:.72,points:[[0,0],[.72,0],[.64,.73],[0,.69]]},
    {x:.66,y:0,w:.34,h:.39,points:[[.72,0],[1,0],[1,.4],[.68,.37]]},
    {x:.64,y:.37,w:.36,h:.36,points:[[.68,.37],[1,.4],[1,.72],[.64,.73]]},
    {x:0,y:.69,w:1,h:.31,points:[[0,.69],[.64,.73],[1,.72],[1,1],[0,1]]}
  ];
}
function drawPanel(g,i,w,h) {
  const p=state.panels[i], photo=photos[p.photo]?.image;
  if(!photo)return;
  ctx.save();
  let x=g.x*w,y=g.y*h,pw=g.w*w,ph=g.h*h;
  if(g.points){const xs=g.points.map(p=>p[0]*w),ys=g.points.map(p=>p[1]*h);x=Math.min(...xs);y=Math.min(...ys);pw=Math.max(...xs)-x;ph=Math.max(...ys)-y;}
  if(g.angle){ctx.translate(x+pw/2,y+ph/2);ctx.rotate(g.angle);x=-pw/2;y=-ph/2;}
  const points=g.points?.map(([px,py])=>[px*w,py*h])??[[x,y],[x+pw,y],[x+pw,y+ph],[x,y+ph]];
  polygon(points); ctx.clip();
  const scale=Math.max(pw/photo.width,ph/photo.height)*p.zoom;
  const iw=photo.width*scale,ih=photo.height*scale;
  const dx=Math.max(x+pw-iw,Math.min(x,x+(pw-iw)/2+p.x*pw));
  const dy=Math.max(y+ph-ih,Math.min(y,y+(ph-ih)/2+p.y*ph));
  ctx.filter=filters.find(f=>f.id===state.filter).css;
  ctx.drawImage(photo,dx,dy,iw,ih);ctx.filter='none';
  const f=filters.find(f=>f.id===state.filter), tint=ctx.createLinearGradient(x,y,x+pw,y+ph);
  tint.addColorStop(0,f.overlay[0]);tint.addColorStop(1,f.overlay[1]);ctx.fillStyle=tint;ctx.fillRect(x-20,y-20,pw+40,ph+40);
  const shadow=ctx.createLinearGradient(0,h*.26,0,h);shadow.addColorStop(0,'#160c2300');shadow.addColorStop(.5,'#160c2320');shadow.addColorStop(1,'#160c23c0');ctx.fillStyle=shadow;ctx.fillRect(0,0,w,h);
  ctx.restore();
  ctx.save();if(g.angle){ctx.translate((g.x+g.w/2)*w,(g.y+g.h/2)*h);ctx.rotate(g.angle);}
  polygon(points);ctx.lineJoin='round';ctx.strokeStyle='#180f22';ctx.lineWidth=Math.max(10,w*.009);ctx.stroke();
  ctx.lineWidth=1.5;ctx.strokeStyle='#f2a7a859';ctx.stroke();ctx.restore();
}
function palm(x,y,s,lean) {
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.rotate(lean);
  ctx.strokeStyle='#160f23';ctx.fillStyle='#160f23';ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(0,170);ctx.quadraticCurveTo(-18,65,0,0);ctx.lineWidth=9;ctx.stroke();
  for(let j=0;j<7;j++) { const a=-Math.PI+j*.5;ctx.save();ctx.rotate(a);ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(20,-25,65,-25,86,17);ctx.bezierCurveTo(50,-8,27,8,0,0);ctx.fill();for(let k=1;k<9;k++){ctx.beginPath();ctx.moveTo(k*8,-10);ctx.lineTo(k*8+10,20-k);ctx.lineWidth=2;ctx.stroke();}ctx.restore(); }
  ctx.restore();
}
function drawTypography(w,h) {
  const wide=state.format==='wide';
  ctx.save();
  const u=w/1920;
  ctx.textAlign='left';ctx.fillStyle='#ffe4d4';ctx.font=`${Math.round(w*.009)}px Display`;ctx.letterSpacing=`${w*.002}px`;
  ctx.fillText('AFTERGLOW  /  ORIGINAL STORIES',w*.035,h*.059);
  ctx.textAlign='right';ctx.font=`${Math.round(w*.0085)}px Display`;ctx.fillText('VOL. 01  —  PARADISE FOUND',w*.965,h*.059);ctx.letterSpacing='0px';
  const title=state.title.trim().toUpperCase();
  const words=title.split(/\s+/);let lines=[];
  if(words.length>1){const cut=Math.ceil(words.length/2);lines=[words.slice(0,cut).join(' '),words.slice(cut).join(' ')];} else lines=[title];
  let fontSize=wide?w*.114:w*.142;
  const maxWidth=wide?w*.64:w*.9;
  ctx.font=`${fontSize}px Display`;
  const measured=Math.max(...lines.map(l=>ctx.measureText(l).width));
  fontSize*=Math.min(1,maxWidth/Math.max(measured,1));
  const baseline=h*(wide?.735:.77),lineHeight=fontSize*1.03;
  const left=w*(wide?.038:.055);
  ctx.textAlign='left';ctx.font=`${fontSize}px Display`;ctx.lineJoin='round';
  lines.forEach((line,i)=>{
    const y=baseline+(i-(lines.length-1))*lineHeight;
    ctx.save();ctx.translate(left,y);ctx.transform(1,-.035,-.09,1,0,0);
    ctx.lineWidth=fontSize*.105;ctx.strokeStyle='#160e22';ctx.shadowColor='#0c081b';ctx.shadowBlur=0;ctx.shadowOffsetX=fontSize*.035;ctx.shadowOffsetY=fontSize*.055;ctx.strokeText(line,0,0);
    ctx.shadowColor='transparent';ctx.lineWidth=fontSize*.022;ctx.strokeStyle='#ffdddf';ctx.strokeText(line,0,0);
    const grad=ctx.createLinearGradient(0,-fontSize,0,fontSize*.1);grad.addColorStop(0,'#fff1d0');grad.addColorStop(.4,'#ffcf9e');grad.addColorStop(.63,'#ffa4b9');grad.addColorStop(1,'#d96cad');ctx.fillStyle=grad;ctx.fillText(line,0,0);ctx.restore();
  });
  // A slanted, neon-lit local serif signature, used when the requested script font is unavailable.
  const subSize=w*(wide?.027:.034);let subFit=1;ctx.font=`italic ${subSize}px Signature`;
  subFit=Math.min(1,(wide?w*.65:w*.86)/Math.max(1,ctx.measureText(state.subtitle).width));
  ctx.save();ctx.translate(left,h*(wide?.83:.855));ctx.rotate(-.035);ctx.scale(subFit,1);ctx.font=`italic ${subSize}px Signature`;ctx.shadowColor='#f94b9e';ctx.shadowBlur=12*u;ctx.lineWidth=1.2*u;ctx.strokeStyle='#e66ca5';ctx.strokeText(state.subtitle,0,0);ctx.fillStyle='#ffe6ea';ctx.fillText(state.subtitle,0,0);ctx.restore();
  ctx.fillStyle='#f6c6c4';ctx.font=`${w*.008}px Display`;ctx.letterSpacing=`${w*.002}px`;ctx.fillText('LONG DAYS.  LATE NIGHTS.  NO LOOKING BACK.',w*.038,h*.95);ctx.letterSpacing='0px';
  ctx.textAlign='right';ctx.fillText('AN AFTERGLOW PICTURE',w*.962,h*.95);
  if(wide){palm(w*.94,h*.64,w*.0017,-.14);palm(w*.86,h*.78,w*.0011,.15);}
  ctx.restore();
}
function draw() {
  if(!ready)return;
  const [w,h]=sizes[state.format];if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  ctx.fillStyle='#1a1025';ctx.fillRect(0,0,w,h);
  geometry().forEach((g,i)=>drawPanel(g,i,w,h));
  if(state.vignette){const v=ctx.createRadialGradient(w*.47,h*.4,h*.12,w*.5,h*.5,Math.max(w,h)*.65);v.addColorStop(0,'#180c2000');v.addColorStop(1,'#13091ccc');ctx.fillStyle=v;ctx.fillRect(0,0,w,h);}
  if(state.halftone){ctx.save();ctx.fillStyle='#20102b';ctx.globalAlpha=.26;const step=w*.007;for(let x=0;x<w;x+=step)for(let y=0;y<h;y+=step){ctx.beginPath();ctx.arc(x,y,step*.18,0,Math.PI*2);ctx.fill();}ctx.restore();}
  drawTypography(w,h);
  if(state.grain){ctx.save();ctx.globalAlpha=.065;ctx.fillStyle=ctx.createPattern(texture,'repeat');ctx.fillRect(0,0,w,h);ctx.restore();}
  ctx.strokeStyle='#110c1a';ctx.lineWidth=w*.018;ctx.strokeRect(0,0,w,h);ctx.lineWidth=w*.001;ctx.strokeStyle='#f3b6af';ctx.strokeRect(w*.01,w*.01,w*.98,h-w*.02);
}
function updateSelection(show=false){const g=geometry()[selected];$('panel-number').textContent=String(selected+1).padStart(2,'0');$('zoom').value=state.panels[selected].zoom;$('zoom-value').value=Math.round(state.panels[selected].zoom*100)+'%';const el=$('selection');el.style.display=show?'block':'none';if(g){Object.assign(el.style,{left:g.x*100+'%',top:g.y*100+'%',width:g.w*100+'%',height:g.h*100+'%'});} }
function sync() {
  $('format').value=state.format;$('title').value=state.title;$('subtitle').value=state.subtitle;
  ['grain','vignette','halftone'].forEach(k=>$(k).checked=state[k]);
  document.querySelectorAll('.layout-button').forEach(b=>{const on=b.dataset.id===state.layout;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});
  document.querySelectorAll('.filter').forEach(b=>{const on=b.dataset.id===state.filter;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});
  $('undo').disabled=!history.length;$('redo').disabled=!future.length;
  const [w,h]=sizes[state.format];$('dimensions').textContent=`${w} × ${h} px`;
  const frame=document.querySelector('.canvas-frame');frame.style.maxWidth=state.format==='wide'?'1100px':state.format==='portrait'?'340px':'420px';
  if(document.body.classList.contains('shot-cover'))frame.style.maxWidth='none';
  selected=Math.min(selected,geometry().length-1);updateSelection();renderPhotos();draw();
}
function renderPhotos(){const list=$('photos');list.replaceChildren();photos.forEach((p,i)=>{const b=document.createElement('button');b.className='photo'+(i===activePhoto?' active':'');b.setAttribute('aria-label',`Use photo ${i+1}: ${p.name}`);b.title=p.name;const img=document.createElement('img');img.src=p.src;img.alt=p.name;const n=document.createElement('span');n.textContent=String(i+1).padStart(2,'0');b.append(img,n);b.onclick=()=>{activePhoto=i;change(()=>{state.panels[selected]={photo:i,x:0,y:0,zoom:1};});};list.append(b);});$('photo-count').textContent=String(photos.length).padStart(2,'0');}
function notify(text){$('toast').textContent=text;$('toast').style.opacity=1;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').style.opacity=0,2600);}
async function loadPhoto(src,name){const image=new Image();image.src=src;await image.decode();return{src,name,image};}
async function upload(files){let added=[];for(const file of files){if(!file.type.startsWith('image/'))continue;let src=URL.createObjectURL(file);try{added.push(await loadPhoto(src,file.name));}catch{URL.revokeObjectURL(src);notify('This image could not be opened. Try JPG, PNG or WebP.');}}if(added.length){const start=photos.length;photos.push(...added);activePhoto=start;change(()=>{geometry().forEach((g,i)=>{state.panels[i]={photo:start+i%added.length,x:0,y:0,zoom:1};});});notify(`${added.length} photo${added.length>1?'s':''} added. Make it yours.`);}$('upload').value='';}
function undo(){if(!history.length)return;future.push(copy());state=history.pop();sync();}
function redo(){if(!future.length)return;history.push(copy());state=future.pop();sync();}
layouts.forEach(l=>{const b=document.createElement('button');b.className='layout-button';b.dataset.id=l.id;b.setAttribute('aria-label',l.name+' layout');const icon=document.createElement('span');icon.className='layout-icon';icon.style.gridTemplateColumns=l.columns;icon.style.gridTemplateRows=l.rows;for(let i=0;i<l.count;i++)icon.append(document.createElement('i'));const label=document.createElement('span');label.textContent=l.name;b.append(icon,label);b.onclick=()=>change(()=>{state.layout=l.id;selected=0;});$('layouts').append(b);});
filters.forEach(f=>{const b=document.createElement('button');b.className='filter';b.dataset.id=f.id;b.setAttribute('aria-label',f.name+' filter');const swatch=document.createElement('i');swatch.style.background=`linear-gradient(145deg,${f.colors.join(',')})`;const name=document.createElement('span');name.textContent=f.name;b.append(swatch,name);b.onclick=()=>change(()=>state.filter=f.id);$('filters').append(b);});
$('format').onchange=e=>change(()=>state.format=e.target.value);
for(const id of ['title','subtitle']){$(id).onfocus=()=>checkpoint();$(id).oninput=e=>{state[id]=e.target.value;draw();$('undo').disabled=!history.length;$('redo').disabled=true;};}
for(const id of ['grain','vignette','halftone'])$(id).onchange=e=>change(()=>state[id]=e.target.checked);
$('zoom').onpointerdown=()=>checkpoint();$('zoom').onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key))checkpoint();};$('zoom').oninput=e=>{state.panels[selected].zoom=Number(e.target.value);draw();updateSelection(true);$('undo').disabled=!history.length;$('redo').disabled=true;};
$('reset').onclick=()=>change(()=>{const p=state.panels[selected];p.x=0;p.y=0;p.zoom=1;});
$('fill').onclick=()=>change(()=>state.panels.forEach(p=>Object.assign(p,{photo:activePhoto,x:0,y:0,zoom:1})));
let ideaIndex=0;const ideas=[['NEON SHORE','Where the night meets the tide'],['SUNSET HEIST','One last ride into the gold'],['PALM AFTER DARK','Good days. Beautiful trouble.'],['VICE CITY NIGHTS','A little trouble in paradise']];
$('idea').onclick=()=>change(()=>{[state.title,state.subtitle]=ideas[ideaIndex++%ideas.length];});
$('undo').onclick=undo;$('redo').onclick=redo;
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();e.shiftKey?redo():undo();}});
$('upload').onchange=e=>upload(e.target.files);
const drop=$('dropzone');['dragenter','dragover'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('dragover');}));['dragleave','drop'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('dragover');}));drop.addEventListener('drop',e=>upload(e.dataTransfer.files));
canvas.addEventListener('dragover',e=>e.preventDefault());canvas.addEventListener('drop',e=>{e.preventDefault();upload(e.dataTransfer.files);});
function point(e){const r=canvas.getBoundingClientRect();return[(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];}
function inside(x,y,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [xi,yi]=points[i],[xj,yj]=points[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)yes=!yes;}return yes;}
canvas.onpointerdown=e=>{if(!ready)return;const [x,y]=point(e),gs=geometry();for(let i=gs.length-1;i>=0;i--){const g=gs[i];if(g.points?inside(x,y,g.points):(x>=g.x&&x<=g.x+g.w&&y>=g.y&&y<=g.y+g.h)){selected=i;break;}}checkpoint();const p=state.panels[selected];dragging={x,y,px:p.x,py:p.y};canvas.setPointerCapture(e.pointerId);updateSelection(true);$('undo').disabled=false;$('redo').disabled=true;};
canvas.onpointermove=e=>{if(!dragging)return;const [x,y]=point(e),g=geometry()[selected],p=state.panels[selected];p.x=Math.max(-3,Math.min(3,dragging.px+(x-dragging.x)/g.w));p.y=Math.max(-3,Math.min(3,dragging.py+(y-dragging.y)/g.h));draw();};
canvas.onpointerup=()=>{dragging=null;};canvas.onpointercancel=()=>{dragging=null;};
$('export').onclick=async()=>{if(!ready)return;const b=$('export');b.disabled=true;draw();canvas.toBlob(blob=>{if(!blob){b.disabled=false;notify('Export failed. Please try again.');return;}const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=`afterglow-${state.format}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);b.disabled=false;notify('Your cover is ready. See you after dark.');},'image/png');};
async function init(){
  photos=await Promise.all([loadPhoto('./samples/boulevard.jpg','Boulevard · sample'),loadPhoto('./samples/pier.jpg','Pier · sample')]);
  await Promise.all([document.fonts.load('bold 32px Display'),document.fonts.load('italic 32px Signature')]);
  texture=document.createElement('canvas');texture.width=texture.height=128;const t=texture.getContext('2d'),d=t.createImageData(128,128);let seed=721;for(let i=0;i<d.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=seed>>>24;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}t.putImageData(d,0,0);
  const q=new URLSearchParams(location.search);
  if(q.get('shot')==='cover'){document.body.classList.add('shot-cover');if(sizes[q.get('format')])state.format=q.get('format');if(q.get('format')==='portrait'){state.title='NEON SHORE';state.subtitle='Where the night meets the tide';state.filter='candy';}if(q.get('format')==='square'){state.title='SUNSET HEIST';state.subtitle='One last ride into the gold';state.layout='hero';state.filter='gold';}}
  ready=true;sync();document.body.dataset.ready='true';
}
init().catch(error=>{console.error(error);notify('A local asset could not load. Please reopen the studio.');});
