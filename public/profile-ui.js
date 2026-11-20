import {startCamera} from './camera-client.js';
const $ = selector => document.querySelector(selector);
const frames = new Map();
let layer, scheduled = false, currentState, context, slotObserver;

export function portrait(user, index, esc, answer='', showCameraLink=true) {
  const photo = /^\/avatars\/[a-f0-9]{32}\.png$/.test(user.avatarUrl || '') ? `<img src="${esc(user.avatarUrl)}" alt="Аватар: ${esc(user.name)}">` : esc(user.name.trim().slice(0,2).toUpperCase());
  return `<div class="portrait ${user.cameraUrl?'with-camera':''} ${answer?'has-player-answer':''}" data-camera-slot="${esc(user.id)}"><span class="avatar a${index%4}">${photo}</span>${answer?`<span class="player-answer-overlay ${answer.length>80?'long-answer':''}" title="${esc(answer)}" role="status"><span>${esc(answer)}</span></span>`:''}</div>${user.cameraUrl&&showCameraLink?`<a class="camera-popout" href="${esc(user.cameraUrl)}" target="_blank" rel="noopener noreferrer">Открыть видео</a>`:''}`;
}

// Video nodes stay connected outside the replaced game DOM across score updates.
function positionFrames() {
  scheduled = false;
  for (const [id, entry] of frames) {
    const slot = [...document.querySelectorAll('.sidebar [data-camera-slot],.player-deck [data-camera-slot]')].find(el=>el.dataset.cameraSlot===id);
    if (!slot) { entry.frame.hidden=true; continue; }
    const rect = slot.getBoundingClientRect();
    entry.frame.hidden = rect.width === 0;
    Object.assign(entry.frame.style, {left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
  }
}
function schedulePosition() { if(!scheduled) {scheduled=true;requestAnimationFrame(positionFrames);} }

export function syncCameras(state) {
  currentState=state;
  if (!layer) {
    layer=document.createElement('div');layer.id='camera-layer';document.body.append(layer);
    window.addEventListener('scroll',schedulePosition,true);window.addEventListener('resize',schedulePosition);
    new ResizeObserver(schedulePosition).observe($('#app'));
  }
  const wanted=new Map(state?[state.host,...state.players].filter(p=>p.cameraUrl).map(p=>[p.id,p]):[]);
  for(const [id,entry] of frames)if(!wanted.has(id)||wanted.get(id).cameraUrl!==entry.url){entry.stop();entry.frame.remove();frames.delete(id);}
  slotObserver ||= new ResizeObserver(schedulePosition);slotObserver.disconnect();
  for(const slot of document.querySelectorAll('.sidebar [data-camera-slot],.player-deck [data-camera-slot]'))slotObserver.observe(slot);
  for(const [id,user] of wanted)if(!frames.has(id)){
    const frame=document.createElement('div');frame.setAttribute('aria-label',`Камера: ${user.name}`);frame.className='camera-frame';
    layer.append(frame);frames.set(id,{frame,url:user.cameraUrl,stop:startCamera(frame,user.cameraUrl)});
  }
  for(const [id,entry]of frames){
    const text=state?.playerAnswers?.[id]||'';
    entry.frame.classList.toggle('has-player-answer',Boolean(text));
    let overlay=entry.frame.querySelector('.player-answer-overlay');
    if(text){
      if(!overlay){overlay=document.createElement('span');overlay.className='player-answer-overlay';overlay.append(document.createElement('span'));entry.frame.append(overlay);}
      if(overlay.firstChild.textContent!==text)overlay.firstChild.textContent=text;
      overlay.title=text;overlay.classList.toggle('long-answer',text.length>80);
    }else overlay?.remove();
  }
  positionFrames();schedulePosition();
}

export function setupProfile(options) {
  context=options;
  const dialog=document.createElement('dialog');dialog.id='profile-dialog';
  dialog.innerHTML=`<form id="profile-form"><div class="dialog-head"><span class="eyebrow">Твоё место за столом</span><button type="button" class="icon-button" id="close-profile" aria-label="Закрыть профиль">×</button></div>
    <h2>Фото и камера</h2><p class="muted profile-intro">Аватарка и видео видны всем в этой комнате.</p>
    <div class="profile-photo-row"><span class="avatar" id="profile-preview"></span><div><label class="button small ghost" for="avatar-file">Загрузить фото</label><input type="file" id="avatar-file" accept="image/png,image/jpeg,image/webp" hidden><button type="button" class="text-button" id="remove-avatar">Удалить фото</button><small>JPG, PNG или WebP · до 12 МБ</small></div></div>
    <div class="profile-camera-head"><h3>Камера VDO.Ninja</h3><span class="pill">Без звука</span></div>
    <p class="muted">Создай трансляцию, выбери обычную или виртуальную камеру (например, OBS Virtual Camera) и нажми Start в новой вкладке. Оставь её открытой.</p>
    <button type="button" class="button ghost small" id="create-camera">Создать трансляцию ↗</button>
    <label for="camera-url">Ссылка просмотра VDO.Ninja</label><input id="camera-url" type="url" maxlength="2048" placeholder="https://vdo.ninja/?view=…" autocomplete="off" spellcheck="false">
    <p class="muted camera-help">Для готовой трансляции вставь ссылку с ?view=. Нажми «Сохранить», чтобы включить видео в карточке. Для отключения очисти поле. Для VDO.Ninja нужен доступ к интернету; сама игра остаётся на ПК ведущего через Radmin.</p>
    <p class="error" id="profile-error" role="alert"></p><div class="profile-actions"><button type="button" class="button small ghost" id="disconnect-camera">Отключить видео</button><button class="button primary" id="save-profile" type="submit">Сохранить</button></div></form>`;
  document.body.append(dialog);
  $('#close-profile').onclick=()=>dialog.close();
  $('#avatar-file').onchange=uploadPhoto;
  $('#remove-avatar').onclick=async()=>{
    try{await context.request('/api/profile',{code:currentState.code,cameraUrl:ownUser().cameraUrl||'',removeAvatar:true});paintPhoto({...ownUser(),avatarUrl:''});context.toast('Фото удалено.');}catch(e){$('#profile-error').textContent=e.message;}
  };
  $('#create-camera').onclick=()=>{
    const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join('');
    const id='svoya'+random(),password=random();
    const viewer=new URL('https://vdo.ninja/');viewer.searchParams.set('view',id);viewer.searchParams.set('password',password);
    $('#camera-url').value=viewer.href;
    const publisher=new URL('https://vdo.ninja/');publisher.searchParams.set('push',id);publisher.searchParams.set('password',password);publisher.searchParams.set('webcam','1');publisher.searchParams.set('audiodevice','0');
    for(const [key,value]of Object.entries({videobitrate:'400',width:'640',height:'360',fps:'15'}))publisher.searchParams.set(key,value);
    window.open(publisher.href,'_blank','noopener,noreferrer');
    context.toast('Выбери камеру и запусти трансляцию в новой вкладке, затем сохрани профиль.');
  };
  $('#disconnect-camera').onclick=async()=>{
    try{await context.request('/api/profile',{code:currentState.code,cameraUrl:''});$('#camera-url').value='';dialog.close();context.toast('Видео отключено. Аватарка сохранена.');}catch(e){$('#profile-error').textContent=e.message;}
  };
  $('#profile-form').onsubmit=async event=>{
    event.preventDefault();$('#save-profile').disabled=true;$('#profile-error').textContent='';
    try{await context.request('/api/profile',{code:currentState.code,cameraUrl:$('#camera-url').value.trim()});dialog.close();context.toast('Профиль сохранён.');}
    catch(e){$('#profile-error').textContent=e.message;}finally{$('#save-profile').disabled=false;}
  };
}
function ownUser(){return currentState.me==='host'?currentState.host:currentState.players.find(p=>p.id===currentState.me);}
function paintPhoto(user){
  const preview=$('#profile-preview');preview.replaceChildren();
  if(user.avatarUrl){const image=document.createElement('img');image.src=user.avatarUrl;image.alt='Твоя аватарка';preview.append(image);}else preview.textContent=user.name.trim().slice(0,2).toUpperCase();
  $('#remove-avatar').disabled=!user.avatarUrl;
}
export function openProfile(){
  const user=ownUser();paintPhoto(user);$('#camera-url').value=user.cameraUrl||'';$('#profile-error').textContent='';$('#avatar-file').value='';$('#profile-dialog').showModal();
}
async function uploadPhoto(event){
  const file=event.target.files[0];if(!file)return;
  $('#profile-error').textContent='';
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024){$('#profile-error').textContent='Выберите JPG, PNG или WebP не больше 12 МБ.';return;}
  $('#save-profile').disabled=true;$('#remove-avatar').disabled=true;$('#avatar-file').disabled=true;
  let bitmap;
  try{
    bitmap=await createImageBitmap(file);
    const cropped=await cropPhoto(bitmap);if(!cropped)return;
    const result=await context.request(`/api/avatar?room=${currentState.code}`,cropped);
    paintPhoto({...ownUser(),avatarUrl:result.avatarUrl});context.toast('Аватарка сохранена и видна всем в комнате.');
  }catch(e){$('#profile-error').textContent=e.message||'Не удалось прочитать фото.';}
  finally{bitmap?.close();$('#save-profile').disabled=false;$('#avatar-file').disabled=false;$('#remove-avatar').disabled=!ownUser().avatarUrl;event.target.value='';}
}

export function cropRect(width,height,zoom=1,x=0,y=0){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Некорректный размер фото.');
  zoom=Math.max(1,Math.min(4,Number(zoom)||1));x=Math.max(-1,Math.min(1,Number(x)||0));y=Math.max(-1,Math.min(1,Number(y)||0));
  const size=Math.min(width,height)/zoom;
  return {x:(width-size)*(x+1)/2,y:(height-size)*(y+1)/2,width:size,height:size};
}
function cropPhoto(bitmap){
  return new Promise((resolve,reject)=>{
    const dialog=document.createElement('dialog');dialog.className='avatar-crop-dialog';
    dialog.innerHTML=`<div class="dialog-head"><span class="eyebrow">Аватарка</span><button type="button" class="icon-button crop-cancel" aria-label="Закрыть кадрирование">×</button></div><h2>Выбери кадр</h2><p class="muted">Потяни фото мышью или пальцем. Увеличь и сдвинь его, чтобы выбрать видимую часть.</p><canvas class="crop-preview" width="384" height="384" role="img" aria-label="Предпросмотр аватарки"></canvas><div class="crop-controls"><label>Масштаб<input class="crop-zoom" type="range" min="1" max="4" step="0.05" value="1"></label><label>По горизонтали<input class="crop-x" type="range" min="-100" max="100" step="1" value="0"></label><label>По вертикали<input class="crop-y" type="range" min="-100" max="100" step="1" value="0"></label></div><p class="error crop-error" role="alert"></p><div class="crop-actions"><button type="button" class="button ghost crop-reset">Сбросить</button><button type="button" class="button primary crop-save">Сохранить аватарку</button></div>`;
    document.body.append(dialog);
    const canvas=dialog.querySelector('canvas'),zoom=dialog.querySelector('.crop-zoom'),x=dialog.querySelector('.crop-x'),y=dialog.querySelector('.crop-y'),save=dialog.querySelector('.crop-save');
    const finish=value=>{dialog.close();dialog.remove();resolve(value);};
    const draw=()=>{const rect=cropRect(bitmap.width,bitmap.height,zoom.value,Number(x.value)/100,Number(y.value)/100);const c=canvas.getContext('2d');c.clearRect(0,0,384,384);c.imageSmoothingQuality='high';c.drawImage(bitmap,rect.x,rect.y,rect.width,rect.height,0,0,384,384);};
    for(const input of [zoom,x,y])input.addEventListener('input',draw);
    dialog.querySelector('.crop-reset').onclick=()=>{zoom.value='1';x.value=y.value='0';draw();};
    dialog.querySelector('.crop-cancel').onclick=()=>finish(null);
    dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
    let drag;
    canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);drag={clientX:e.clientX,clientY:e.clientY,x:Number(x.value),y:Number(y.value)};};
    canvas.onpointermove=e=>{
      if(!drag)return;const side=cropRect(bitmap.width,bitmap.height,zoom.value).width,width=canvas.getBoundingClientRect().width;
      x.value=String(bitmap.width>side?Math.max(-100,Math.min(100,drag.x-(e.clientX-drag.clientX)*side/width*200/(bitmap.width-side))):0);
      y.value=String(bitmap.height>side?Math.max(-100,Math.min(100,drag.y-(e.clientY-drag.clientY)*side/width*200/(bitmap.height-side))):0);draw();
    };
    canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
    save.onclick=()=>{save.disabled=true;canvas.toBlob(blob=>{if(blob)finish(new File([blob],'avatar.png',{type:'image/png'}));else{save.disabled=false;dialog.querySelector('.crop-error').textContent='Не удалось сохранить фото.';}},'image/png');};
    dialog.showModal();draw();
  });
}
