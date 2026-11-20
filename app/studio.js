/* Afterglow: one renderer for local previews, cover views and PNG exports. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const LAYOUTS = [
    { id: 'city', name: '斜切城市', count: 4 },
    { id: 'grid', name: '九宫格', count: 9 },
    { id: 'hero', name: '主图＋三图', count: 4 },
    { id: 'full', name: '全幅', count: 1 },
    { id: 'diptych', name: '双联', count: 2 },
    { id: 'snapshots', name: '倾斜快照', count: 3 },
  ];
  const FILTERS = [
    { id: 'sunset', name: '日落', css: 'saturate(1.25) contrast(1.12) sepia(0.18)', tint: ['#ffad67', '#dc4c8c', '#332255'] },
    { id: 'neon', name: '霓虹', css: 'saturate(1.65) contrast(1.2)', tint: ['#38d4ce', '#f032ab', '#36134d'] },
    { id: 'film', name: '复古胶片', css: 'sepia(0.4) saturate(0.8) contrast(0.93)', tint: ['#d7b879', '#a66c54', '#404434'] },
    { id: 'mono', name: '黑白高对比', css: 'grayscale(1) contrast(1.6)', tint: ['#aaaaaa', '#555555', '#080808'] },
    { id: 'night', name: '青蓝夜色', css: 'saturate(0.8) brightness(0.72) contrast(1.2)', tint: ['#13c9c6', '#195987', '#07162f'] },
  ];
  const FORMATS = [
    { id: 'square', name: '方形', w: 1080, h: 1080 },
    { id: 'portrait', name: '竖版', w: 1080, h: 1350 },
    { id: 'wide', name: '横版', w: 1920, h: 1080 },
  ];
  const params = new URLSearchParams(location.search);
  const coverMode = params.get('shot') === 'cover';
  if (coverMode) document.body.classList.add('shot-cover');
  const canvas = $('cover');
  const assets = [];
  const cleanTransform = () => ({ x: 0, y: 0, z: 1 });
  let state = {
    layout: 'city', filter: 'sunset', format: FORMATS.some(f => f.id === params.get('format')) ? params.get('format') : 'portrait',
    title: 'NEON SHORE', subtitle: 'Chasing the last light', grain: true, vignette: true, halftone: false,
    selected: 0, photo: 0, library: [0, 1],
    panels: Array.from({ length: 9 }, (_, i) => ({ image: [0, 1, 0, 0][i % 4], ...cleanTransform() })),
  };
  let past = [], future = [], transaction = null, drag = null, ready = false;
  let toastTimer, pendingFrame = 0;
  const snapshot = () => JSON.stringify(state);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function notify(message) {
    $('status').textContent = message;
    $('status').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('status').classList.remove('visible'), 2800);
  }
  function remember(before) {
    if (before !== snapshot()) {
      past.push(before);
      if (past.length > 80) past.shift();
      future = [];
    }
  }
  function change(fn) {
    finishEdit();
    const before = snapshot();
    fn();
    remember(before);
    sync();
  }
  function beginEdit() { if (!transaction) transaction = snapshot(); }
  function finishEdit() {
    if (transaction) { const before = transaction; transaction = null; remember(before); }
  }
  function history(redo) {
    finishEdit();
    const from = redo ? future : past, to = redo ? past : future;
    if (!from.length) return;
    to.push(snapshot());
    state = JSON.parse(from.pop());
    sync();
    notify(redo ? '已重做' : '已撤销');
  }
  const rect = (x, y, w, h) => [[x,y], [x+w,y], [x+w,y+h], [x,y+h]];
  function geometry() {
    if (state.layout === 'city') return [
      [[0,0],[.64,0],[.53,.61],[.45,1],[0,1]],
      [[.64,0],[1,0],[1,.38],[.57,.49]],
      [[.57,.49],[1,.38],[1,.72],[.49,.8]],
      [[.49,.8],[1,.72],[1,1],[.45,1]],
    ];
    if (state.layout === 'grid') return Array.from({length:9}, (_, i) => rect((i%3)/3, Math.floor(i/3)/3, 1/3, 1/3));
    if (state.layout === 'hero') return [rect(0,0,.67,1), ...Array.from({length:3}, (_,i)=>rect(.67,i/3,.33,1/3))];
    if (state.layout === 'full') return [rect(0,0,1,1)];
    if (state.layout === 'diptych') return [rect(0,0,.5,1),rect(.5,0,.5,1)];
    return [
      [[.02,.09],[.52,.02],[.61,.79],[.11,.86]],
      [[.50,.12],[.96,.19],[.85,.87],[.39,.8]],
      [[.24,.49],[.77,.46],[.81,.96],[.28,.99]],
    ];
  }
  function bounds(poly, w, h) {
    const xs = poly.map(p=>p[0]*w), ys = poly.map(p=>p[1]*h);
    return { x:Math.min(...xs), y:Math.min(...ys), w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys) };
  }
  function path(ctx, poly, w, h) {
    ctx.beginPath();
    poly.forEach(([x,y],i) => i ? ctx.lineTo(x*w,y*h) : ctx.moveTo(x*w,y*h));
    ctx.closePath();
  }
  function metrics(panel, box) {
    const img = assets[panel.image]?.image;
    if (!img) return null;
    const scale = Math.max(box.w / img.width, box.h / img.height) * panel.z;
    const iw = img.width * scale, ih = img.height * scale;
    return { img, iw, ih, ox:Math.max(0,iw-box.w), oy:Math.max(0,ih-box.h) };
  }
  // A fixed-seed noise tile; the same state always renders the same texture.
  const grainTile = document.createElement('canvas');
  grainTile.width = grainTile.height = 160;
  const gc = grainTile.getContext('2d'), noise = gc.createImageData(160,160);
  let seed = 60419;
  for (let i=0; i<noise.data.length; i+=4) {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    const value = seed >>> 24;
    noise.data[i] = noise.data[i+1] = noise.data[i+2] = value;
    noise.data[i+3] = 34;
  }
  gc.putImageData(noise,0,0);
  function render(target, guides = false) {
    const fmt = FORMATS.find(f=>f.id===state.format);
    if (target.width !== fmt.w || target.height !== fmt.h) { target.width=fmt.w; target.height=fmt.h; }
    const ctx = target.getContext('2d'), w=target.width, h=target.height, unit=Math.min(w,h);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='#27273b';ctx.fillRect(0,0,w,h);
    const polygons = geometry(), filter=FILTERS.find(f=>f.id===state.filter);
    polygons.forEach((poly,i) => {
      const box=bounds(poly,w,h), panel=state.panels[i], m=metrics(panel,box);
      ctx.save();
      if (state.layout==='snapshots') {
        path(ctx,poly,w,h);ctx.shadowColor='#0009';ctx.shadowBlur=unit*.018;ctx.shadowOffsetY=unit*.009;
        ctx.fillStyle='#f7e7c5';ctx.fill();ctx.shadowColor='transparent';
      }
      path(ctx,poly,w,h);ctx.clip();
      if (m) {
        ctx.filter=filter.css;
        ctx.drawImage(m.img,box.x-m.ox*(panel.x+1)/2,box.y-m.oy*(panel.y+1)/2,m.iw,m.ih);
        ctx.filter='none';
      }
      const tint=ctx.createLinearGradient(0,0,w*.2,h);
      tint.addColorStop(0,filter.tint[0]);tint.addColorStop(.5,filter.tint[1]);tint.addColorStop(1,filter.tint[2]);
      ctx.globalCompositeOperation='soft-light';ctx.globalAlpha=.7;ctx.fillStyle=tint;ctx.fillRect(0,0,w,h);
      ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
      ctx.restore();
      path(ctx,poly,w,h);ctx.lineWidth=unit*(state.layout==='snapshots'?.017:.009);
      ctx.lineJoin='round';ctx.strokeStyle=state.layout==='snapshots'?'#f4e2bd':'#191723';ctx.stroke();
    });
    if (state.grain) { ctx.fillStyle=ctx.createPattern(grainTile,'repeat');ctx.fillRect(0,0,w,h); }
    if (state.halftone) {
      ctx.save();ctx.fillStyle='#111522';ctx.globalAlpha=.24;
      const step=unit/100;
      for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){ctx.beginPath();ctx.arc(x+(Math.round(y/step)%2)*step/2,y,step*.19,0,Math.PI*2);ctx.fill();}
      ctx.restore();
    }
    if (state.vignette) {
      const v=ctx.createRadialGradient(w*.48,h*.38,unit*.2,w*.5,h*.5,Math.max(w,h)*.74);
      v.addColorStop(0,'#06091b00');v.addColorStop(1,'#100e24cc');ctx.fillStyle=v;ctx.fillRect(0,0,w,h);
    }
    const shade=ctx.createLinearGradient(0,h*.42,0,h);
    shade.addColorStop(0,'#10122500');shade.addColorStop(1,'#151127db');ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
    // Editorial frame and margin details are part of the exported artwork.
    ctx.strokeStyle='#f7dcaf99';ctx.lineWidth=unit*.0015;ctx.strokeRect(unit*.025,unit*.025,w-unit*.05,h-unit*.05);
    ctx.fillStyle='#f8e7c7';ctx.textBaseline='top';ctx.textAlign='left';
    ctx.font=`${unit*.012}px AfterBold, sans-serif`;
    ctx.fillText('AFTERGLOW  /  ORIGINAL STORIES',unit*.055,unit*.055);
    ctx.textAlign='right';ctx.fillText('ISSUE 001   —   COAST TO COAST',w-unit*.055,unit*.055);
    ctx.textAlign='left';
    const wide = state.format==='wide';
    const titleWidth=wide?w*.58:w*.88, tx=unit*.055;
    const words=state.title.trim().split(/\s+/).filter(Boolean);
    let lines;
    if (state.title.includes('\n')) lines=state.title.split('\n').slice(0,3);
    else if(words.length>1) { const split=Math.ceil(words.length/2);lines=[words.slice(0,split).join(' '),words.slice(split).join(' ')]; }
    else lines=[state.title.trim()];
    const desired=wide?unit*.24:unit*.195;
    let size=desired;
    ctx.font=`${size}px AfterBold, sans-serif`;
    const longest=Math.max(1,...lines.map(s=>ctx.measureText(s).width));
    size *= Math.min(1,titleWidth/longest);
    const lineHeight=size*.87, base=h-unit*.178, top=base-lineHeight*lines.length;
    ctx.font=`${size}px AfterBold, sans-serif`;ctx.textBaseline='top';ctx.lineJoin='round';
    lines.forEach((line,i)=>{
      const y=top+i*lineHeight;
      ctx.lineWidth=unit*.016;ctx.strokeStyle='#171625';ctx.strokeText(line,tx,y);
      ctx.fillStyle='#d86488';ctx.fillText(line,tx+unit*.006,y+unit*.009);
      ctx.fillStyle='#fff0cf';ctx.fillText(line,tx,y);
    });
    ctx.save();ctx.translate(tx+unit*.012,h-unit*.173);ctx.rotate(-.045);
    let sigSize=wide?unit*.05:unit*.046;
    ctx.font=`italic ${sigSize}px AfterSerif, serif`;
    const sigWidth=ctx.measureText(state.subtitle).width;
    if(sigWidth>w*.85){sigSize*=w*.85/sigWidth;ctx.font=`italic ${sigSize}px AfterSerif, serif`;}
    ctx.fillStyle='#ffa5ba';ctx.shadowColor='#f25a9b';ctx.shadowBlur=unit*.012;ctx.fillText(state.subtitle,0,0);ctx.restore();
    ctx.textBaseline='bottom';ctx.font=`${unit*.0105}px AfterBold, sans-serif`;ctx.fillStyle='#e9d4ba';
    ctx.fillText('SOME NIGHTS NEVER FADE.',tx,h-unit*.053);
    ctx.textAlign='right';ctx.fillText('A PHOTO STORY  /  MADE BY YOU',w-unit*.055,h-unit*.053);
    // A small, original sun seal balances the headline.
    const sx=w-unit*.108, sy=h-unit*.185, radius=unit*.038;
    ctx.strokeStyle='#f5c59b';ctx.lineWidth=unit*.0015;ctx.beginPath();ctx.arc(sx,sy,radius,0,Math.PI*2);ctx.stroke();
    for(let i=-2;i<=2;i++){const yy=i*radius*.26, xx=Math.sqrt(radius*radius-yy*yy);ctx.beginPath();ctx.moveTo(sx-xx,sy+yy);ctx.lineTo(sx+xx,sy+yy);ctx.stroke();}
    ctx.textAlign='left';
    if (guides && !coverMode) {
      // Small selectable badges avoid putting crop borders over the finished art.
      polygons.forEach((poly,i)=>{
        const box=bounds(poly,w,h), x=box.x+Math.min(box.w*.35,unit*.047), y=box.y+unit*.108;
        ctx.beginPath();ctx.arc(x,y,unit*.017,0,Math.PI*2);
        ctx.fillStyle=i===state.selected?'#ff966b':'#151b20aa';ctx.fill();
        ctx.font=`${unit*.016}px sans-serif`;ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillStyle=i===state.selected?'#211b15':'#f5dfc5';ctx.fillText(String(i+1),x,y);
      });
    }
    ctx.textAlign='left';ctx.textBaseline='alphabetic';
  }
  function draw() { if (!ready || pendingFrame) return; pendingFrame=requestAnimationFrame(()=>{pendingFrame=0;render(canvas,true);}); }
  function makeButton(id, name, cls, parent) {
    const b=document.createElement('button');b.type='button';b.dataset.id=id;b.className=cls;b.textContent=name;parent.append(b);return b;
  }
  LAYOUTS.forEach(item=>{
    const b=makeButton(item.id,item.name,'layout-button',$('layouts'));
    const icon=document.createElement('span');icon.className='layout-icon '+item.id;b.prepend(icon);
    b.onclick=()=>change(()=>{state.layout=item.id;state.selected=0;});
  });
  FILTERS.forEach(item=>{
    const b=makeButton(item.id,item.name,'filter-button',$('filters'));
    const dot=document.createElement('span');dot.className='swatch '+item.id;b.prepend(dot);
    b.onclick=()=>change(()=>{state.filter=item.id;});
  });
  FORMATS.forEach(item=>{
    const b=makeButton(item.id,item.name,'format-button',$('formats'));
    const size=document.createElement('small');size.textContent=`${item.w}×${item.h}`;b.append(size);
    b.onclick=()=>change(()=>{state.format=item.id;});
  });
  function syncPhotos() {
    $('photos').replaceChildren();
    state.library.forEach(id=>{
      const b=makeButton(String(id),'','photo'+(state.photo===id?' selected':''),$('photos'));
      b.setAttribute('aria-label','使用照片：'+assets[id].name);b.setAttribute('aria-pressed',String(state.photo===id));
      const img=document.createElement('img');img.src=assets[id].src;img.alt=assets[id].name;b.append(img);
      b.onclick=()=>change(()=>{state.photo=id;state.panels[state.selected]={image:id,...cleanTransform()};});
    });
    $('photo-count').textContent=String(state.library.length).padStart(2,'0');
  }
  function sync() {
    if (!ready) return;
    for(const [group,key] of [['layouts','layout'],['filters','filter'],['formats','format']]) {
      $(group).querySelectorAll('button').forEach(b=>{const active=b.dataset.id===state[key];b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    }
    for(const id of ['title','subtitle']) if($(id).value!==state[id])$(id).value=state[id];
    for(const id of ['grain','vignette','halftone'])$(id).checked=state[id];
    const zoom=state.panels[state.selected].z;
    $('zoom').value=zoom;$('zoom-value').textContent=Math.round(zoom*100)+'%';
    $('panel-label').textContent='面板 '+String(state.selected+1).padStart(2,'0');
    const f=FORMATS.find(f=>f.id===state.format);$('dimensions').textContent=`${f.w} × ${f.h}`;
    $('undo').disabled=!past.length;$('redo').disabled=!future.length;
    syncPhotos();draw();
  }
  for(const key of ['title','subtitle']) {
    $(key).addEventListener('focus',beginEdit);
    $(key).addEventListener('input',()=>{beginEdit();state[key]=$(key).value;draw();});
    $(key).addEventListener('change',()=>{finishEdit();sync();});
    $(key).addEventListener('blur',()=>{finishEdit();sync();});
  }
  $('ideas').addEventListener('click',e=>{const b=e.target.closest('button');if(b)change(()=>{state.title=b.dataset.title;});});
  for(const key of ['grain','vignette','halftone'])$(key).onchange=()=>change(()=>{state[key]=$(key).checked;});
  $('zoom').addEventListener('pointerdown',beginEdit);
  $('zoom').addEventListener('input',()=>{beginEdit();state.panels[state.selected].z=Number($('zoom').value);$('zoom-value').textContent=Math.round(Number($('zoom').value)*100)+'%';draw();});
  $('zoom').addEventListener('change',()=>{finishEdit();sync();});
  $('reset').onclick=()=>change(()=>Object.assign(state.panels[state.selected],cleanTransform()));
  $('fill-all').onclick=()=>change(()=>{state.panels=state.panels.map(()=>({image:state.photo,...cleanTransform()}));});
  $('undo').onclick=()=>history(false);$('redo').onclick=()=>history(true);
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(e.shiftKey);}
  });
  function point(e) { const b=canvas.getBoundingClientRect();return { x:(e.clientX-b.left)/b.width, y:(e.clientY-b.top)/b.height }; }
  function inside(point,poly) {
    let hit=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
      const [x,y]=poly[i],[px,py]=poly[j];
      if((y>point.y)!==(py>point.y)&&point.x<(px-x)*(point.y-y)/(py-y)+x)hit=!hit;
    }
    return hit;
  }
  canvas.addEventListener('pointerdown',e=>{
    if(coverMode||!ready||e.button!==0)return;
    finishEdit();const p=point(e), polys=geometry();
    const index=polys.map((poly,i)=>inside(p,poly)?i:-1).filter(i=>i>=0).pop();
    if(index===undefined)return;
    state.selected=index;state.photo=state.panels[index].image;sync();
    const box=bounds(polys[index],canvas.width,canvas.height), m=metrics(state.panels[index],box);
    drag={id:e.pointerId,start:p,before:snapshot(),initial:{...state.panels[index]},m};
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    const p=point(e), panel=state.panels[state.selected], m=drag.m;
    if(m.ox>.1)panel.x=clamp(drag.initial.x-(p.x-drag.start.x)*canvas.width*2/m.ox,-1,1);
    if(m.oy>.1)panel.y=clamp(drag.initial.y-(p.y-drag.start.y)*canvas.height*2/m.oy,-1,1);
    draw();
  });
  function endDrag(e) { if(!drag||drag.id!==e.pointerId)return;remember(drag.before);drag=null;sync(); }
  canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
  function loadImage(src) {return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('无法读取图片'));img.src=src;});}
  function readFile(file) {return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});}
  async function importFiles(files) {
    if(!ready)return;
    const added=[];let failed=0;
    for(const file of files) {
      if(!file.type.startsWith('image/')){failed++;continue;}
      try {const src=await readFile(file), image=await loadImage(src), id=assets.length;assets.push({src,image,name:file.name});added.push(id);} catch {failed++;}
    }
    if(added.length)change(()=>{state.library.push(...added);state.photo=added[0];state.panels[state.selected]={image:added[0],...cleanTransform()};});
    $('files').value='';notify(`已导入 ${added.length} 张照片`+(failed?`，${failed} 个文件无法读取`:'，点击缩略图分配到面板'));
  }
  $('files').onchange=e=>importFiles(e.target.files);
  document.addEventListener('dragover',e=>{e.preventDefault();$('drop-zone').classList.add('over');});
  document.addEventListener('dragleave',e=>{if(!e.relatedTarget)$('drop-zone').classList.remove('over');});
  document.addEventListener('drop',e=>{e.preventDefault();$('drop-zone').classList.remove('over');importFiles(e.dataTransfer.files);});
  async function exportPNG() {
    if(!ready)return;
    finishEdit();const output=document.createElement('canvas');render(output,false);
    try {
      const uri=output.toDataURL('image/png');
      const a=document.createElement('a');a.href=uri;a.download=`afterglow-${state.format}.png`;a.click();
      notify(`已导出 ${output.width} × ${output.height} PNG`);
    } catch {notify('图片无法导出，请重新从本机导入照片后再试。');}
  }
  $('export').onclick=exportPNG;$('export-top').onclick=exportPNG;
  async function init() {
    try {
      const names=['海岸余晖 · 样张','码头晴日 · 样张'];
      const loaded=await Promise.all(globalThis.AFTERGLOW_SAMPLES.map(loadImage));
      loaded.forEach((image,i)=>assets.push({image,src:globalThis.AFTERGLOW_SAMPLES[i],name:names[i]}));
      await Promise.all([document.fonts.load('700 32px AfterBold'),document.fonts.load('italic 32px AfterSerif')]);
      await document.fonts.ready;
      ready=true;sync();render(canvas,!coverMode);
      document.documentElement.dataset.ready='true';
    } catch(error) {notify('初始化失败：'+error.message);document.documentElement.dataset.error=error.message;}
  }
  init();
})();
