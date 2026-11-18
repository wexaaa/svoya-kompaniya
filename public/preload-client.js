let current=null,state=null,send=null,sequence=0,lastReport=0;
const completed=new Set(),failures=new Set();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// HTTP caching works on LAN/Radmin origins too, without HTTPS or a service worker.
// Keep only a bounded set of blobs for range-based audio/video playback.
const blobs=new Map(),controllers=new Set();let blobBytes=0;
export function cachedMedia(url){try{return blobs.get(new URL(url,location.origin).href)?.url||url;}catch{return url;}}
function releaseBlobs(){for(const b of blobs.values())URL.revokeObjectURL(b.url);blobs.clear();blobBytes=0;}
function trimBlobs(assets){
  const keep=new Set(assets.map(a=>new URL(a.url,location.origin).href));
  for(const [key,b]of blobs)if(!keep.has(key)){URL.revokeObjectURL(b.url);blobBytes-=b.bytes;blobs.delete(key);}
}
export function paintPreload(next=state){
  state=next;if(!state)return;
  let panel=document.querySelector('#preload-panel');
  const p=state.preload;
  if(!p||p.done){panel?.remove();return;}
  if(!panel){panel=document.createElement('section');panel.id='preload-panel';panel.className='preload-panel';panel.setAttribute('aria-label','Предзагрузка медиа');document.querySelector('.game-area')?.prepend(panel);}
  panel.innerHTML=`<div class="preload-heading"><b>Предзагрузка медиа · раунд ${p.round+1}</b><span>Исчезнет, когда все будут готовы</span></div><div class="preload-people">${p.people.map(person=>{const percent=Math.floor(person.loaded/Math.max(1,person.total)*100);return `<div class="preload-person"><span>${esc(person.name)}${person.id==='host'?' · ведущий':''}</span><progress max="100" value="${percent}" aria-label="${esc(person.name)}: ${percent}%"></progress><b>${percent}%</b><small>${person.loaded}/${person.total}${person.failed?` · ошибок: ${person.failed}`:''}</small></div>`;}).join('')}</div>${p.people.some(p=>p.failed)?'<button class="button small ghost" id="retry-preload">Повторить загрузку у меня</button>':''}`;
  panel.querySelector('#retry-preload')?.addEventListener('click',()=>{failures.clear();start(state,send,true);});
}
function report(force=false){
  if(!current||!send)return;const now=Date.now();if(!force&&now-lastReport<500)return;lastReport=now;
  send('preload_progress',{id:current.id,loaded:current.assets.filter(a=>completed.has(new URL(a.url,location.origin).href)).length,failed:current.assets.filter(a=>failures.has(new URL(a.url,location.origin).href)).length});
}
async function download(asset,run){
  const url=new URL(asset.url,location.origin);if(!['http:','https:'].includes(url.protocol))throw Error('Недопустимый адрес');
  if(completed.has(url.href))return;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),180000);controllers.add(controller);
  try{
    const same=url.origin===location.origin;
    const response=await fetch(url,{cache:'force-cache',credentials:same?'same-origin':'omit',signal:controller.signal});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    const blob=await response.blob();
    if(run!==sequence)return;
    if(asset.type!=='image'&&blobBytes+blob.size<=256*1024*1024&&!blobs.has(url.href)){
      blobs.set(url.href,{url:URL.createObjectURL(blob),bytes:blob.size});blobBytes+=blob.size;
    }
    completed.add(url.href);failures.delete(url.href);
  }finally{clearTimeout(timeout);controllers.delete(controller);}
}
async function start(next,callback,retry=false){
  state=next;send=callback;const manifest=next?.preload;
  if(!manifest){current=null;sequence++;paintPreload();return;}
  if(current?.id===manifest.id&&!retry){report(true);paintPreload();return;}
  const changed=current?.id!==manifest.id;
  current=manifest;const run=++sequence;
  if(changed){for(const c of controllers)c.abort();trimBlobs(manifest.assets);failures.clear();}
  paintPreload();report(true);
  const queue=[...manifest.assets];
  const worker=async()=>{while(queue.length&&run===sequence){const asset=queue.shift();try{await download(asset,run);}catch{if(run===sequence)failures.add(new URL(asset.url,location.origin).href);}if(run===sequence)report();}};
  await Promise.all([worker(),worker()]);if(run===sequence)report(true);
}
export function syncPreload(next,callback){
  if(current?.id===next?.preload?.id){state=next;send=callback;paintPreload();return;}
  start(next,callback).catch(()=>{});
}
export function preloadReconnect(){report(true);}
export function stopPreload(){sequence++;for(const c of controllers)c.abort();current=null;state=null;send=null;releaseBlobs();document.querySelector('#preload-panel')?.remove();}
