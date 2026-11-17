import {finalHtml} from './final-ui.js';
import {portrait,setupProfile,openProfile,syncCameras} from './profile-ui.js';
import {syncVideoView,closeVideoView} from './media-view.js';
const $ = (s, root=document) => root.querySelector(s);
const app = $('#app');
const esc = text => String(text ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = n => Number(n).toLocaleString('ru-RU');
let state=null, session=null, socket=null, reconnectTimer=null, connection='connecting', meta={}, uploadBusy=false, timeOffset=0, pingMs=null, lastBuzz=null;
let audioContext,renderedQuestionId=null,wrongFlashTimer;
let sideTab='chat',chatUnread=0,chatSending=false,chatDraft='';
const storage = { get(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}, set(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}, remove(key){try{localStorage.removeItem(key);}catch{}} };
let seatSize=storage.get('svoya:seat-size')||'normal';
if(!['small','normal','large'].includes(seatSize))seatSize='normal';
function applySeatSize(value){seatSize=value;document.body.dataset.seatSize=value;storage.set('svoya:seat-size',value);if(state)syncCameras(state);}
function clockHtml(s=state){
  if(!s.deadline&&!s.paused)return '';
  if(!s.deadline&&s.pauseRemainingMs===null)return '';
  const label=s.autoBoard?'До табло':s.status==='answering'||s.status==='final_answer'?'На ответ':'На кнопку';
  return `<span class="answer-clock"><span class="timer-label">${label}</span><span class="timer" id="timer" role="timer" aria-label="${label}: осталось секунд"></span></span>`;
}
let mediaPrefs=storage.get('svoya:media-settings')||{volume:1,muted:false};
if(!Number.isFinite(mediaPrefs.volume)||mediaPrefs.volume<0||mediaPrefs.volume>1)mediaPrefs={volume:1,muted:false};
const mediaSync=new WeakMap(),blockedMedia=new Set();
const remembered = () => storage.get('svoya:last');
const saveSession = s => { storage.set(`svoya:${s.code}`,s); storage.set('svoya:last',s); };
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),4200);}
function unlockSound(){try{audioContext ||= new (window.AudioContext || window.webkitAudioContext)();audioContext.resume();}catch{}}
function beep(){try{if(!audioContext)return;const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.connect(gain);gain.connect(audioContext.destination);osc.frequency.value=740;gain.gain.setValueAtTime(.06,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.22);osc.start();osc.stop(audioContext.currentTime+.22);}catch{}}
async function request(url,body,options={}){
  const response=await fetch(url,{method:body===undefined?'GET':'POST',headers:{...(body instanceof File?{'Content-Type':'application/octet-stream'}:{'Content-Type':'application/json'}),...(session?{'Authorization':`Bearer ${session.token}`}:{})},body:body===undefined?undefined:body instanceof File?body:JSON.stringify(body),...options});
  let data;try{data=await response.json();}catch{throw new Error('Сервер недоступен. Проверьте, что окно запуска открыто.');}
  if(!response.ok)throw new Error(data.error||'Ошибка сервера');return data;
}
const avatar = (name,i=0) => `<span class="avatar a${i%4}">${esc(name.trim().slice(0,2).toUpperCase())}</span>`;
function shareOrigin(){const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);return meta.shareUrl||(local?(meta.publicUrl||meta.lanUrls?.[0]||location.origin):location.origin);}

setupProfile({request,toast});
function home(){
  closeVideoView();
  document.body.classList.remove('in-room');
  syncCameras(null);
  const room=new URLSearchParams(location.search).get('room')?.toUpperCase()||'';
  const previous=remembered();
  app.innerHTML=`${previous?`<div class="resume-banner"><span>У тебя есть комната <b>${esc(previous.code)}</b>. Продолжим?</span><button class="button small" id="resume">Вернуться ↗</button></div>`:''}
  <section class="home-hero"><div class="hero-copy"><div class="eyebrow">Викторина для своих</div><h1>Твоя компания.<br><span>Твоя игра.</span></h1><p>Собирайте друзей, выбирайте вопросы и жмите на кнопку раньше всех. Хороший вечер начинается здесь.</p><div class="hero-tags"><span>Без регистрации</span><span>До 12 игроков</span><span>Пакеты .siq</span></div></div>
  <div class="preview" aria-hidden="true"><div class="preview-header"><span class="eyebrow">Хорошая компания</span><span class="pill green">● Первый раунд</span></div><div class="preview-grid">${['Кино','100','200','300','400','Игры','100','200','300','400','Вокруг света','100','200','300','400','Наука','100','200','300','400'].map((v,i)=>`<span class="${i%5===0?'preview-theme':i===7?'selected':i===1||i===6||i===11?'faded':''}">${v}</span>`).join('')}</div><div class="preview-players"><div>${avatar('МА',1)}<span>Маша<strong>1 200</strong></span></div><div>${avatar('СА',3)}<span>Саша<strong>800</strong></span></div><div>${avatar('ДА',2)}<span>Даня<strong>1 000</strong></span></div></div><span class="preview-note">Сегодня все свои</span></div></section>
  <section class="entry-area"><article class="entry-card"><div class="card-top"><span class="card-icon">＋</span><div><h3>Я буду ведущим</h3><p>Создай комнату и пригласи друзей.</p></div></div><form id="create-form"><div class="inline-form"><div class="field"><label for="host-name">Как тебя зовут?</label><input id="host-name" name="name" placeholder="Твоё имя" maxlength="24" required autocomplete="nickname"></div><button class="button primary" type="submit">Создать комнату <span>→</span></button></div><p class="form-note">Готовый набор уже внутри. Свой .siq можно загрузить в лобби.</p><p class="error form-error" role="alert"></p></form></article>
  <article class="entry-card"><div class="card-top"><span class="card-icon">↗</span><div><h3>Меня уже ждут</h3><p>Введи код комнаты от ведущего.</p></div></div><form id="join-form"><div class="inline-form"><div class="field"><label for="player-name">Твоё имя</label><input id="player-name" name="name" placeholder="Имя игрока" maxlength="24" required autocomplete="nickname"></div><div class="field"><label for="room-code">Код комнаты</label><input id="room-code" name="code" class="code-input" placeholder="A7BK2C" value="${esc(room)}" minlength="6" maxlength="6" required autocomplete="off" spellcheck="false"></div><button class="button ghost" type="submit">Войти →</button></div><p class="form-note">Один из друзей — ведущий. Остальные соревнуются.</p><p class="error form-error" role="alert"></p></form></article></section>
  <div class="home-bottom"><span><b>01</b> Соберитесь в звонке</span><span><b>02</b> Выберите вопросы</span><span><b>03</b> Узнайте, кто всё знает</span></div>`;
  $('#resume')?.addEventListener('click',()=>enter(previous));
  $('#create-form').addEventListener('submit',e=>submitEntry(e,'create'));
  $('#join-form').addEventListener('submit',e=>submitEntry(e,'join'));
  if(room)$('#player-name').focus();
}
async function submitEntry(event,type){
  event.preventDefault();unlockSound();const form=event.currentTarget,button=$('button[type=submit]',form);button.disabled=true;$('.form-error',form).textContent='';
  try{const body=Object.fromEntries(new FormData(form));if(type==='join')body.code=body.code.toUpperCase().trim();const result=await request(`/api/${type}`,body);saveSession(result);enter(result);}
  catch(error){$('.form-error',form).textContent=error.message;button.disabled=false;}
}
function enter(s){if(session?.code!==s.code){chatDraft='';chatUnread=0;sideTab='chat';}session=s;saveSession(s);state=null;connection='connecting';history.replaceState({},'',`/?room=${encodeURIComponent(s.code)}`);connect();app.innerHTML='<div class="entry-card" style="margin-top:40px"><h2>Подключаемся к комнате…</h2><p class="muted">Это займёт несколько секунд.</p></div>';}
function connect(){
  clearTimeout(reconnectTimer);if(socket){socket.onclose=null;socket.close();}
  socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
  socket.addEventListener('open',()=>{socket.send(JSON.stringify({type:'auth',code:session.code,token:session.token}));});
  socket.addEventListener('message',event=>{
    const data=JSON.parse(event.data);
    if(data.type==='state'){
      connection='online';timeOffset=data.state.now-Date.now();
      if(data.state.buzz && data.state.buzz!==lastBuzz)beep();lastBuzz=data.state.buzz;
      state=data.state;render();
    }else if(data.type==='chat'&&state&&data.code===state.code){
      const previous=state.chat?.at(-1)?.id;
      state.chat=data.messages;
      if(previous!==state.chat.at(-1)?.id&&sideTab!=='chat')chatUnread++;
      paintChat();
    }else if(data.type==='latency'&&state?.me==='host'&&data.code===state.code){
      for(const measurement of data.players){const player=state.players.find(p=>p.id===measurement.id);if(player){player.pingMs=measurement.pingMs;player.online=measurement.online;const badge=app.querySelector(`[data-ping-player="${player.id}"]`);if(badge)paintPlayerPing(badge,player);}}
    }else if(data.type==='error')toast(data.error);
    else if(data.type==='pong'){pingMs=Math.max(0,Date.now()-data.sent);const node=$('#ping');if(node)node.textContent=`${pingMs} мс`;}
  });
  socket.addEventListener('close',event=>{
    connection='offline';if(state)render();
    if(event.code===4001){toast('Сессия завершена. Войдите заново.');leave(false);return;}
    if(session)reconnectTimer=setTimeout(connect,2000);
  });
  socket.addEventListener('error',()=>{});
}
function act(action,extra={}){unlockSound();if(!state || connection!=='online' || socket?.readyState!==WebSocket.OPEN){toast('Подключение восстанавливается. Подождите.');return;}socket.send(JSON.stringify({type:'action',action,...extra}));}
function leave(ask=true){
  if(ask&&!confirm('Выйти на главную? Комната и счёт сохранятся.'))return;
  clearTimeout(reconnectTimer);if(socket){socket.onclose=null;socket.close();}socket=null;session=null;state=null;history.replaceState({},'','/');home();
}
function mediaHtml(items){return (items||[]).map(m=>{
  let url;try{url=new URL(m.url,location.origin);if(!['http:','https:'].includes(url.protocol))return '';}catch{return '';}
  const source=esc(url.href);if(m.type==='image')return `<img src="${source}" alt="Иллюстрация к вопросу" loading="eager" data-media="${source}">`;
  if(m.type==='audio'||m.type==='video'){
    const host=state?.me==='host',element=`<${m.type} src="${source}" ${host?'controls':'tabindex="-1" disablepictureinpicture disableremoteplayback controlslist="nodownload noremoteplayback"'} playsinline preload="auto" aria-label="${m.type==='audio'?'Аудио вопроса':'Видео вопроса'}" data-media="${source}"></${m.type}>`;
    return host?element:`<div class="controlled-media ${m.type}">${element}<div class="media-follow-label"><span>${m.type==='audio'?'Музыка / аудио':'Видео'}</span><span class="media-follow-status">Управляет ведущий</span></div></div>`;
  }return '';
}).join('');}
function playersHtml(){
  const occupied=state.players.map((p,i)=>`<div class="player player-seat ${p.id===state.me?'me':''} ${p.id===state.buzz&&state.status==='answering'?'responding':''} ${p.id===state.chooser?'choosing':''} ${(state.passed||[]).includes(p.id)?'has-passed':''}" data-seat="${p.id}">
    ${portrait(p,i+1,esc)}<div class="player-copy"><b title="${esc(p.name)}">${esc(p.name)}${p.id===state.me?' · ты':''}</b>
    <small>${(state.passed||[]).includes(p.id)?'Пас':!p.online?'○ Не в сети':state.chooser===p.id&&['lobby','board','revealed'].includes(state.status)?state.status==='lobby'?'Первый ход':'Выбирает вопрос':state.status==='lobby'?p.ready?'✓ Готов к игре':'● В комнате':p.id===state.buzz&&state.status==='answering'?'Отвечает':'● В игре'}</small>
    ${state.me==='host'?`<span class="player-ping" data-ping-player="${p.id}"></span>`:''}</div>
    <button class="score-button ${p.score<0?'negative':''}" data-score="${p.id}" ${state.me!=='host'?'disabled':''} title="${state.me==='host'?'Изменить счёт':'Очки'}">${num(p.score)}</button>
    ${state.me==='host'&&state.status==='lobby'?`<button class="text-button seat-remove" data-kick="${p.id}" aria-label="Удалить ${esc(p.name)}">×</button>`:''}
    ${state.me==='host'?`<div class="host-player-controls"><button class="button small ghost" data-add-score="${p.id}" ${state.final?'disabled':''} aria-label="Добавить или снять баллы: ${esc(p.name)}">± Баллы</button><button class="button small ${state.chooser===p.id?'good':'ghost'}" data-give-turn="${p.id}" ${state.final||state.board.final||!['lobby','board','revealed'].includes(state.status)||state.chooser===p.id?'disabled':''} title="Передать право выбора следующего вопроса" aria-label="Передать ход: ${esc(p.name)}">${state.chooser===p.id?'Ход здесь':'Передать ход'}</button></div>`:''}</div>`).join('');
  const empty=Array.from({length:Math.max(0,3-state.players.length)},()=>'<div class="player player-seat empty-seat" aria-label="Свободное место игрока"><span class="avatar empty-avatar" aria-hidden="true">＋</span><div class="player-copy"><b>Свободное место</b><small>Ждём игрока</small></div><span class="empty-score">—</span></div>').join('');
  return occupied+empty;
}
function paintPlayerPing(badge,player){
  const measured=player.online&&Number.isFinite(player.pingMs);
  badge.textContent=!player.online?'Пинг: не в сети':measured?`Пинг: ${player.pingMs} мс`:'Пинг: измеряем…';
  badge.className='player-ping '+(measured?(player.pingMs<100?'good':player.pingMs<200?'medium':'poor'):'pending');
  badge.title='Время передачи от сервера до игрока и обратно. Обновляется примерно каждые 5 секунд.';
}
function chatMessages(){return (state.chat||[]).length?state.chat.map(message=>`<article class="chat-message ${message.author===state.me?'mine':''}"><div><b>${esc(message.name)}${message.author==='host'?' · ведущий':''}</b><time>${new Date(message.time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></div><p>${esc(message.text)}</p></article>`).join(''):'<p class="chat-empty">Чат комнаты. Напиши друзьям — сообщение увидят все участники.</p>';}
function roomConversation(){return `<div class="side-card log-card conversation-card"><div class="side-title conversation-tabs" role="tablist" aria-label="Общение в комнате"><button type="button" role="tab" data-side-tab="chat" id="chat-tab" aria-controls="chat-panel" aria-selected="${sideTab==='chat'}">Чат${chatUnread?' ('+chatUnread+')':''}</button><button type="button" role="tab" data-side-tab="log" id="log-tab" aria-controls="log-panel" aria-selected="${sideTab==='log'}">Ход игры</button></div><div id="chat-panel" class="chat-panel" role="tabpanel" aria-labelledby="chat-tab" ${sideTab!=='chat'?'hidden':''}><div class="chat-messages" id="chat-messages" role="log" aria-label="Сообщения комнаты" aria-live="polite">${chatMessages()}</div><form id="chat-form" class="chat-form"><label class="visually-hidden" for="chat-input">Сообщение в чат</label><textarea id="chat-input" maxlength="500" rows="2" placeholder="Сообщение…" required>${esc(chatDraft)}</textarea><button class="button primary chat-send" type="submit" aria-label="Отправить сообщение" ${chatSending||connection!=='online'?'disabled':''}>➤</button></form></div><div class="side-content log-list" id="log-panel" role="tabpanel" aria-labelledby="log-tab" ${sideTab!=='log'?'hidden':''}>${state.log.length?state.log.map(l=>`<div class="log-item">${esc(l.text)}<time>${new Date(l.time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></div>`).join(''):'<p>Самое интересное ещё впереди.</p>'}</div></div>`;}
function sidebar(){return `<aside class="sidebar">${roomConversation()}${state.final?'<div class="host-note"><strong>В финале — письменный ответ.</strong><br>Отправь ответ через поле на сайте. Не называй его вслух, пока остальные не ответили.</div>':'<div class="host-note"><strong>Голосом — в вашем звонке.</strong><br>Ответы говорите вслух. Ведущий решает, засчитать ли ответ.</div>'}<section class="host-seat side-card" aria-label="Ведущий"><span class="eyebrow">Ведущий</span>${portrait(state.host,0,esc)}<b>${esc(state.host.name)}${state.me==='host'?' · ты':''}</b><small><i class="status-dot"></i>${state.host.online?'На связи':'Не в сети'}</small></section></aside>`;}
function selectSideTab(tab){
  sideTab=tab;if(tab==='chat')chatUnread=0;
  for(const name of ['chat','log']){const active=name===tab;$('#'+name+'-panel').hidden=!active;$('#'+name+'-tab').setAttribute('aria-selected',String(active));}
  $('#chat-tab').textContent='Чат'+(chatUnread?' ('+chatUnread+')':'');
  if(tab==='chat'){$('#chat-messages').scrollTop=$('#chat-messages').scrollHeight;}
}
function paintChat(){
  const list=$('#chat-messages');if(!list)return;
  const sticky=list.scrollHeight-list.scrollTop-list.clientHeight<40||state.chat?.at(-1)?.author===state.me;
  list.innerHTML=chatMessages();if(sticky)list.scrollTop=list.scrollHeight;
  $('#chat-tab').textContent='Чат'+(chatUnread?' ('+chatUnread+')':'');
}
async function submitChat(event){
  event.preventDefault();if(chatSending)return;
  const input=$('#chat-input'),text=input.value.trim();if(!text)return;
  chatSending=true;$('#chat-form button').disabled=true;
  try{await request('/api/action',{code:session.code,action:'chat',text});if($('#chat-input')?.value.trim()===text){$('#chat-input').value='';chatDraft='';}}
  catch(error){toast(error.message);}
  finally{chatSending=false;const button=$('#chat-form button');if(button)button.disabled=connection!=='online';}
}
function playerDeck(){return `<section class="player-deck" aria-label="Игроки"><div class="deck-heading"><span>Игроки · ${state.players.length} / 12</span><label class="seat-size-label" for="seat-size">Размер вебок<select id="seat-size"><option value="small" ${seatSize==='small'?'selected':''}>Компактный</option><option value="normal" ${seatSize==='normal'?'selected':''}>Обычный</option><option value="large" ${seatSize==='large'?'selected':''}>Крупный</option></select></label></div><div class="player-seats" style="--seat-cols:${Math.max(3,Math.min(6,state.players.length))}">${playersHtml()}</div></section>`;}
function lobby(){const host=state.me==='host';return `<div class="area-top"><b>Лобби комнаты</b><span>Собираем компанию</span></div><div class="lobby-content"><div class="lobby-title"><div><h2>${host?'Всё готово к хорошей игре':'Ты в своей компании'}</h2><p>${host?'Пригласи друзей, выбери пакет и начинай, когда все соберутся.':'Проверь, что тебя слышно в звонке, и нажми «Я готов». Ведущий скоро начнёт.'}</p></div></div><div class="pack-card"><div class="pack-art">?</div><div class="pack-copy"><span class="eyebrow">Играем сегодня</span><h3>${esc(state.pack.name)}</h3><p>${esc(state.pack.author||'Пользовательский пакет вопросов')}</p><div class="pack-meta"><span>${state.rounds} раунд.</span><span>${state.pack.count} вопросов</span><span>Ведущий + до 12 игроков</span></div></div></div>
  ${host?`<label class="library-label" for="library-select">Готовые пакеты</label><select id="library-select" ${uploadBusy?'disabled':''}><option value="demo" ${state.pack.name==='Хорошая компания'?'selected':''}>Хорошая компания · 30 вопросов</option>${(meta.library||[]).map(p=>`<option value="${esc(p.id)}" ${state.pack.libraryId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}${state.pack.name!=='Хорошая компания'&&!state.pack.libraryId?'<option value="uploaded" selected>Загруженный пакет</option>':''}</select><label class="upload" for="siq-file"><span>↑</span><span>${uploadBusy?'Загружаем и распаковываем…':'Загрузить свой пакет .siq'}</span><input id="siq-file" type="file" accept=".siq" ${uploadBusy?'disabled':''}></label><p class="upload-note">До 512 МБ · текст, изображения, аудио и видео · SIQ 4/5<br>Пакеты больше 100 МБ загружай через localhost на ПК ведущего.</p>`:''}
  ${state.pack.warnings.map(w=>`<div class="warning">${esc(w)}</div>`).join('')}
  <div class="settings"><label class="setting"><input id="minus-setting" type="checkbox" ${state.minus?'checked':''} ${!host?'disabled':''}> Штраф за неверный ответ</label><label class="setting">На кнопку <select id="seconds-setting" ${!host?'disabled':''}>${[10,20,30,60].map(n=>`<option value="${n}" ${n===state.seconds?'selected':''}>${n} сек.</option>`).join('')}</select></label>${host?`<label class="setting"><input id="lock-setting" type="checkbox" ${state.locked?'checked':''}> Закрыть вход</label>`:''}</div>
  <div class="lobby-bottom">${host?`<button class="button primary" id="start-game" ${!state.players.length||uploadBusy?'disabled':''}>Начать игру <span>→</span></button><p>${!state.players.length?'Для старта нужен хотя бы один игрок.':state.players.every(p=>p.ready)?'Все готовы. Можно начинать!':'Не все нажали «Я готов». Ведущий может начать в любой момент.'}</p>`:`<button class="button ${state.players.find(p=>p.id===state.me)?.ready?'good':'primary'}" id="ready-button">${state.players.find(p=>p.id===state.me)?.ready?'✓ Я готов · отменить':'Я готов к игре →'}</button><p>Ждём, когда ведущий запустит игру.</p>`}</div></div>`;}
function board(){
  if(state.board.final)return `<div class="area-top"><b>${esc(state.board.name)}</b><span>Финальный раунд</span></div><div class="lobby-content"><span class="eyebrow">Последний вопрос игры</span><h2>Время решающей ставки</h2><p class="muted">Игроки по очереди уберут темы, сделают скрытые ставки и письменно ответят на один оставшийся вопрос.</p><div class="final-themes">${state.board.themes.map(t=>`<div class="final-theme"><span>${esc(t.name)}</span></div>`).join('')}</div>${state.me==='host'?'<button class="button primary" id="final-start">Начать финал →</button>':'<p class="muted">Ведущий скоро запустит финал.</p>'}</div>`;
  const canSelect=state.me==='host'||state.chooser===state.me,cols=Math.max(...state.board.themes.map(t=>t.questions.length));
  const left=state.board.themes.reduce((n,t)=>n+t.questions.filter(q=>!q.used).length,0);
  const chooser=state.players.find(p=>p.id===state.chooser);
  return `<div class="area-top"><b>${esc(state.board.name)}</b><span>Осталось вопросов: ${left}</span></div><div class="board-wrap"><div class="board-table" style="--cols:${cols}">${state.board.themes.map(t=>`<div class="board-row"><div class="theme-cell">${esc(t.name)}</div>${Array.from({length:cols},(_,i)=>{const q=t.questions[i];return q?`<button class="price-cell ${q.used?'used':''}" data-question="${esc(q.id)}" ${q.used||!canSelect||connection!=='online'?'disabled':''} aria-label="${esc(t.name)}, ${q.price}${q.used?', сыгран':''}">${q.used?'—':num(q.price)}</button>`:'<span></span>';}).join('')}</div>`).join('')}</div></div><p class="board-help">${left===0?'Все вопросы раунда сыграны. '+(state.round+1<state.rounds?'Ведущий может перейти к следующему раунду.':'Ведущий может завершить игру.'):canSelect?'Выбирай тему и стоимость вопроса на табло.':`Вопрос выбирает ${esc(chooser?.name||'ведущий')}.`}</p>${state.me==='host'?`<div class="board-controls"><small>Раунд ${state.round+1} из ${state.rounds}</small><div class="row">${state.round+1<state.rounds?'<button class="button small ghost" id="next-round">Следующий раунд →</button>':''}<button class="button small ghost" id="finish-game">Завершить игру</button></div></div>`:''}`;
}
function stage(){
  const q=state.current,host=state.me==='host',responding=state.players.find(p=>p.id===state.buzz);
  const attempted=state.attempted.includes(state.me),passed=(state.passed||[]).includes(state.me),participant=!state.questionPlayers||state.questionPlayers.includes(state.me),available=!state.paused&&['reading','buzzing'].includes(state.status)&&!attempted&&!passed&&participant;
  const answerOnStage=state.status==='revealed'&&q.answerMedia?.length>0,mainMedia=answerOnStage?q.answerMedia:q.media;
  const myChoice=state.optionSelections?.[state.me],canChoose=q.options?.length>0&&!state.paused&&!host&&connection==='online'&&state.status==='answering'&&state.buzz===state.me&&!Number.isInteger(myChoice);
  const passNames=(state.passed||[]).map(id=>state.players.find(p=>p.id===id)?.name).filter(Boolean);
  const status={reading:q.options?.length?'Сначала нажми «Знаю ответ», затем выбери вариант.':'Кнопка ответа открыта. Кто знает ответ?',buzzing:q.options?.length?'Сначала нажми «Знаю ответ», затем выбери вариант.':'Кнопка ответа открыта. Кто знает ответ?',answering:`Отвечает <strong>${esc(responding?.name||'игрок')}</strong> · ${Number.isInteger(myChoice)?'Твой вариант принят. Ждём оценки ведущего.':!state.deadline?'Вариант выбран. Ждём оценки ведущего.':canChoose?'Выбери вариант · 15 секунд на ответ':'15 секунд на ответ'}`,revealed:state.autoBoard?'Верный ответ! Автоматический переход к табло через 5 секунд.':'Ответ открыт. Можно возвращаться к табло.'}[state.status]+(passNames.length?` <span class="passed-summary">Пас: ${passNames.map(esc).join(', ')}</span>`:'');
  let controls='';
  if(host){
    if(state.status==='answering')controls='<button class="button good" id="half-button">✓ ½ баллов</button><button class="button good" id="correct-button">✓ Верно</button><button class="button good" id="double-button">✓ ×2 баллов</button><button class="button ghost" id="cancel-answer-button">0 · Случайно</button><button class="button bad" id="wrong-button">× Неверно</button>';
    if(state.status==='revealed')controls='<button class="button primary" id="back-board">К табло →</button>';
    else controls+='<button class="button ghost" id="reveal-button">Показать ответ</button>';
  }else if(state.status!=='revealed'){
    let text=available?'Знаю ответ!':state.buzz===state.me?'Ты отвечаешь!':passed?'Ты спасовал':attempted?'Попытка использована':!participant?'Со следующего вопроса':'Кто-то оказался быстрее';
    controls=`<button class="buzz-button" id="buzz-button" ${!available||connection!=='online'?'disabled':''}>${text}<small>${available?'Нажми кнопку или пробел':'Ждём ведущего'}</small></button>`;
    controls+=`<button class="button ghost pass-button" id="pass-button" ${!available||connection!=='online'?'disabled':''}>${passed?'Пас принят':'Пас'}</button>`;
  }else controls='<span class="info-line">Ведущий скоро вернёт игру к табло.</span>';
  const options=!answerOnStage&&q.options?.length?`<div class="answer-options selectable-options">${q.options.map((o,index)=>{
    const chosenBy=Object.entries(state.optionSelections||{}).filter(([,choice])=>choice===index).map(([id])=>id===state.me?'Твой выбор':`Выбор: ${state.players.find(p=>p.id===id)?.name||'игрок'}`);
    const label=`Выбрать вариант ${o.key||index+1}${o.text?': '+o.text:''}`;
    return `<div class="answer-option ${chosenBy.length?'selected':''} ${canChoose?'can-choose':''}"><b>${esc(o.key||index+1)}</b><span>${esc(o.text)}</span><div class="media-container">${mediaHtml(o.media)}</div>${chosenBy.length?`<small class="option-selected-label">${chosenBy.map(esc).join(' · ')}</small>`:''}${!host?`<button type="button" class="option-hit" data-option="${index}" aria-label="${esc(label)}" aria-pressed="${myChoice===index}" ${!canChoose?'disabled':''}></button>`:''}</div>`;
  }).join('')}</div>`:'';
  return `<div class="area-top"><b>${esc(state.board.name)}</b><span>${state.status==='revealed'?'Разбор вопроса':'Вопрос в игре'}</span></div><div class="question-stage ${(mainMedia||[]).some(m=>["image","video"].includes(m.type))?"with-visual":""} ${answerOnStage?'showing-answer-media':''}"><div class="question-meta"><span class="question-category">Категория · ${esc(q.theme)}</span><strong>${num(q.price)}</strong>${answerOnStage?'<span class="answer-stage-label">Правильный ответ</span>':''}${clockHtml()}</div><p class="question-text">${esc(answerOnStage?q.answer:q.text)}</p><div class="media-container">${mediaHtml(mainMedia)}</div>${options}<div class="question-status">${status}</div>${q.answer!==undefined&&!answerOnStage?`<div class="answer-box ${state.status!=='revealed'?'host-answer':''}"><span class="eyebrow">${state.status==='revealed'?'Правильный ответ':'Ответ · виден только ведущему'}</span><p>${esc(q.answer)}</p><div class="media-container">${mediaHtml(q.answerMedia)}</div></div>`:''}</div><div class="question-controls">${controls}</div>`;
}
function results(){const sorted=[...state.players].sort((a,b)=>b.score-a.score),max=sorted[0]?.score,winners=sorted.filter(p=>p.score===max);return `<div class="area-top"><b>Итоги игры</b><span>${esc(state.pack.name)}</span></div><div class="result-stage"><div class="trophy">✦</div><span class="eyebrow">Вот это компания</span><h2>${winners.length===1?`Побеждает ${esc(winners[0].name)}!`:'Победа на двоих? Или даже больше!'}</h2><p>Спасибо за игру. Ещё по одной?</p><div class="podium">${sorted.map((p,i)=>`<div class="player"><span class="place">${sorted.findIndex(x=>x.score===p.score)+1}</span>${portrait(p,i+1,esc)}<div class="player-copy"><b>${esc(p.name)}</b></div><strong>${num(p.score)}</strong></div>`).join('')}</div>${state.me==='host'?'<button class="button primary" id="restart-button">Сыграть ещё раз ↗</button>':'<p class="muted">Ведущий может запустить новую игру.</p>'}</div>`;}
function render(){
  if(!state)return;
  document.body.classList.add('in-room');
  document.body.classList.toggle('many-seats',state.players.length>6);
  document.body.dataset.seatSize=seatSize;
  // Reuse media elements across score/connection updates so playback is preserved.
  const sameQuestion=renderedQuestionId===state.current?.id;
  if(!sameQuestion)for(const element of app.querySelectorAll('audio,video')){element.dataset.ignoreUntil=String(Date.now()+5000);element.pause();}
  const media=sameQuestion?new Map([...app.querySelectorAll('[data-media]')].map(el=>[el.dataset.media,el])):new Map();
  renderedQuestionId=state.current?.id;
  const focus=document.activeElement?.id;
  const chatInput=$('#chat-input'),chatCursor=chatInput?{start:chatInput.selectionStart,end:chatInput.selectionEnd}:null;
  if(chatInput)chatDraft=chatInput.value;
  const chatList=$('#chat-messages'),chatScroll=chatList&&chatList.scrollHeight-chatList.scrollTop-chatList.clientHeight>40?chatList.scrollTop:null;
  const drafts=[...app.querySelectorAll('.final-input')].map(el=>({id:el.id,value:el.value,start:el.selectionStart,end:el.selectionEnd}));
  const title=state.status==='lobby'?'Комната для своих':state.status==='finished'?'Отлично сыграли':state.pack.name;
  app.innerHTML=`<div class="room-head"><div class="room-title"><div><span class="eyebrow">${state.me==='host'?'Ты — ведущий':'Ты — в игре'}</span><h1>${esc(title)}</h1></div><span class="connection ${connection==='online'?'':'offline'}"><i class="status-dot"></i>${connection==='online'?'На связи':'Переподключение…'}</span></div><div class="room-actions"><button class="room-code" id="copy-code" title="Скопировать код"><span>Комната</span><strong>${esc(state.code)}</strong><span>⧉</span></button><button class="button small primary" id="invite-button">Пригласить ↗</button><button class="button small ghost" id="profile-button">Фото / камера</button><button class="button small primary media-permission" id="enable-media" hidden title="Браузер просит одно нажатие для автоматического воспроизведения со звуком">Разрешить звук</button><label class="media-volume" for="media-volume">Громкость<input id="media-volume" type="range" min="0" max="100" step="1" value="${Math.round(mediaPrefs.volume*100)}"><output id="volume-value">${mediaPrefs.muted?"выкл":Math.round(mediaPrefs.volume*100)+"%"}</output></label><button class="button small ghost leave-button" id="leave-button">Выйти</button></div></div><div class="room-layout">${sidebar()}<section class="game-area">${state.final&&(state.status.startsWith('final_')||state.status==='finished')?finalHtml(state,{esc,num,mediaHtml,clockHtml}):state.status==='lobby'?lobby():state.status==='board'?board():state.status==='finished'?results():stage()}</section>${playerDeck()}</div>`;
  for(const element of app.querySelectorAll('[data-media]')){const old=media.get(element.dataset.media);if(old)element.replaceWith(old);}
  for(const player of state.players){const badge=app.querySelector(`[data-ping-player="${player.id}"]`);if(badge)paintPlayerPing(badge,player);}
  $('#profile-button').onclick=openProfile;syncCameras(state);
  $('#seat-size').addEventListener('change',event=>applySeatSize(event.target.value));
  for(const button of app.querySelectorAll('[data-side-tab]'))button.onclick=()=>selectSideTab(button.dataset.sideTab);
  $('#chat-form').addEventListener('submit',submitChat);
  $('#chat-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();event.currentTarget.form.requestSubmit();}});
  $('#chat-messages').scrollTop=chatScroll??$('#chat-messages').scrollHeight;
  if(focus==='chat-input'){$('#chat-input').focus();if(chatCursor)$('#chat-input').setSelectionRange(chatCursor.start,chatCursor.end);}
  if(state.me==='host'&&!['lobby','finished'].includes(state.status)){
    const pauseButton=document.createElement('button');pauseButton.id='pause-button';pauseButton.className='button small '+(state.paused?'primary':'ghost');pauseButton.textContent=state.paused?'▶ Продолжить':'Ⅱ Пауза';pauseButton.disabled=connection!=='online';pauseButton.onclick=()=>act(state.paused?'resume':'pause');
    $('#profile-button').before(pauseButton);
  }
  if(state.paused){
    const area=$('.game-area');for(const child of area.children)child.inert=true;
    const remaining=state.pauseRemainingMs===null?'':`<p>На таймере осталось ${Math.ceil(state.pauseRemainingMs/1000)} сек.</p>`;
    area.insertAdjacentHTML('beforeend',`<div class="pause-overlay" role="status"><span class="eyebrow">Перерыв</span><h2>Игра на паузе</h2><p>Таймер и медиа остановлены. Чат доступен.</p>${remaining}${state.me==='host'?'<button class="button primary" id="resume-game">▶ Продолжить игру</button>':'<p class="muted">Ждём продолжения ведущим.</p>'}</div>`);
    $('#resume-game')?.addEventListener('click',()=>act('resume'));
    for(const button of app.querySelectorAll('[data-score],[data-add-score],[data-give-turn],[data-kick]'))button.disabled=true;
  }
  $('#pass-button')?.addEventListener('click',()=>act('pass'));
  for(const button of app.querySelectorAll('[data-option]'))button.addEventListener('click',()=>act('choose_option',{question:state.current.id,option:Number(button.dataset.option)}));
  $('#enable-media').addEventListener('click',retryBlockedMedia);
  $('#media-volume').addEventListener('input',event=>setMediaPreferences({volume:Number(event.target.value)/100,muted:false}));
  $('#leave-button').onclick=()=>leave();$('#copy-code').onclick=()=>copy(state.code,'Код комнаты скопирован');$('#invite-button').onclick=invite;
  bind('#start-game','start');bind('#ready-button','ready');bind('#arm-button','arm');bind('#back-board','board');bind('#reveal-button','reveal');bind('#restart-button','restart');
  $('#correct-button')?.addEventListener('click',()=>act('judge',{correct:true}));$('#wrong-button')?.addEventListener('click',()=>act('judge',{correct:false}));$('#buzz-button')?.addEventListener('click',()=>act('buzz'));
  $('#half-button')?.addEventListener('click',()=>act('judge',{correct:true,multiplier:0.5}));$('#double-button')?.addEventListener('click',()=>act('judge',{correct:true,multiplier:2}));$('#cancel-answer-button')?.addEventListener('click',()=>act('cancel_answer'));
  $('#finish-game')?.addEventListener('click',()=>{if(confirm('Завершить игру и показать итоговый счёт?'))act('finish');});
  $('#next-round')?.addEventListener('click',()=>{if(confirm('Перейти к следующему раунду? Оставшиеся вопросы этого раунда будут пропущены.'))act('nextRound');});
  for(const button of app.querySelectorAll('[data-question]'))button.onclick=()=>act('select',{id:button.dataset.question});
  for(const button of app.querySelectorAll('[data-score]'))if(state.me==='host'){if(state.final)button.disabled=true;else button.onclick=()=>openScore(button.dataset.score);}
  for(const button of app.querySelectorAll('[data-add-score]'))button.onclick=()=>openScore(button.dataset.addScore,'add');
  for(const button of app.querySelectorAll('[data-give-turn]'))button.onclick=()=>act('give_turn',{player:button.dataset.giveTurn});
  if(state.me==='host')for(const row of app.querySelectorAll('.player-deck .player[data-seat]')){
    const player=row.querySelector('[data-score]')?.dataset.score;if(!player)continue;
    const button=document.createElement('button');button.className='text-button';button.textContent='↗';button.title='Ссылка для возвращения игрока на своё место';button.setAttribute('aria-label','Вернуть игрока на своё место');
    button.onclick=async()=>{try{const result=await request('/api/rejoin-link',{code:state.code,player});meta=await request('/api/info');await copy(`${shareOrigin()}/?room=${state.code}#seat=${result.token}`,'Личная ссылка игрока скопирована. Отправь её этому игроку — его счёт сохранится.');}catch(error){toast(error.message);}};
    (row.querySelector('.host-player-controls')||row).append(button);
  }
  for(const button of app.querySelectorAll('[data-kick]'))button.onclick=()=>{if(confirm('Удалить игрока из комнаты?'))act('kick',{player:button.dataset.kick});};
  for(const id of ['minus-setting','seconds-setting','lock-setting'])$( '#'+id)?.addEventListener('change',()=>act('settings',{minus:$('#minus-setting')?.checked,seconds:$('#seconds-setting')?.value,locked:$('#lock-setting')?.checked}));
  $('#siq-file')?.addEventListener('change',upload);
  bind('#final-start','final_start');bind('#final-open-answers','final_open_answers');bind('#final-publish','final_publish');
  $('#final-fill-bets')?.addEventListener('click',()=>{if(confirm('Завершить приём ставок? Неотправленные ставки будут равны 0.'))act('final_fill_bets');});
  $('#final-close-answers')?.addEventListener('click',()=>{if(confirm('Завершить приём ответов? Неуспевшие будут отмечены без ответа.'))act('final_close_answers');});
  for(const button of app.querySelectorAll('[data-final-theme]'))button.onclick=()=>act('final_remove',{theme:Number(button.dataset.finalTheme)});
  for(const button of app.querySelectorAll('[data-final-judge]'))button.onclick=()=>act('final_judge',{player:button.dataset.finalJudge,correct:button.dataset.correct==='true'});
  $('#final-bet-form')?.addEventListener('submit',e=>{e.preventDefault();act('final_bet',{bet:Number($('#final-bet-input').value)});});
  $('#final-answer-form')?.addEventListener('submit',e=>{e.preventDefault();act('final_answer',{answer:$('#final-answer-input').value});});
  $('#library-select')?.addEventListener('change',async event=>{const id=event.target.value;if(id==='uploaded')return;uploadBusy=true;render();try{await request('/api/library',{code:session.code,id});toast('Пакет выбран. Можно начинать!');}catch(error){toast(error.message);}finally{uploadBusy=false;render();}});
  if(focus && $('#'+focus)?.tagName==='SELECT')$('#'+focus).focus();
  for(const draft of drafts){const el=$('#'+draft.id);if(el){el.value=draft.value;if(focus===draft.id){el.focus();if(el.tagName==='TEXTAREA')el.setSelectionRange(draft.start,draft.end);}}}
  if($('#score-dialog').open)updateScorePreview();
  clearTimeout(wrongFlashTimer);
  const flashRemaining=(state.wrongAnswer?.until||0)-Date.now()-timeOffset;
  if(flashRemaining>0){const card=app.querySelector(`[data-seat="${state.wrongAnswer.player}"]`);if(card){card.classList.add('wrong-flash');wrongFlashTimer=setTimeout(()=>card.classList.remove('wrong-flash'),flashRemaining);}}
  setupMedia();updateTimer();
}
function setMediaPreferences(value){
  mediaPrefs={volume:value.volume,muted:Boolean(value.muted)};storage.set('svoya:media-settings',mediaPrefs);
  for(const media of app.querySelectorAll('video,audio')){if(media.volume!==mediaPrefs.volume)media.volume=mediaPrefs.volume;if(media.muted!==mediaPrefs.muted)media.muted=mediaPrefs.muted;}
  if($('#media-volume'))$('#media-volume').value=Math.round(mediaPrefs.volume*100);
  if($('#volume-value'))$('#volume-value').textContent=mediaPrefs.muted?'выкл':Math.round(mediaPrefs.volume*100)+'%';
}
function setupMedia(){
  for(const el of blockedMedia)if(!el.isConnected)blockedMedia.delete(el);
  for(const el of app.querySelectorAll('video,audio')){
    el.volume=mediaPrefs.volume;el.muted=mediaPrefs.muted;
    if(!el.dataset.bound){
      el.dataset.bound='yes';
      el.dataset.mediaQuestion=state.current?.id||'';
      mediaSync.set(el,{key:null,seekTarget:null,pending:false,blocked:false,error:false,metadataFor:null});
      el.addEventListener('volumechange',()=>{if(el.volume!==mediaPrefs.volume||el.muted!==mediaPrefs.muted)setMediaPreferences({volume:el.volume,muted:el.muted});});
      for(const event of ['play','pause','seeked','ended'])el.addEventListener(event,()=>mediaEvent(el,event));
      el.addEventListener('loadedmetadata',()=>{publishMediaMetadata(el);syncMedia(el,true);});
      el.addEventListener('canplay',()=>{if(state?.me!=='host')syncMedia(el);paintMediaStatus(el);});
      el.addEventListener('error',()=>{const record=mediaSync.get(el);record.error=true;record.blocked=false;blockedMedia.delete(el);paintMediaStatus(el);paintMediaPermission();});
      if(state.me!=='host')el.addEventListener('contextmenu',event=>event.preventDefault());
    }
    publishMediaMetadata(el);
    syncMedia(el);
  }
  paintMediaPermission();
  syncVideoView(state);
}
function playbackFor(el){
  if(!state||!el.isConnected||el.dataset.mediaQuestion!==state.current?.id)return null;
  const entry=Object.entries(state.playback||{}).find(([url])=>new URL(url,location.origin).href===el.src);
  if(!entry)return null;
  const playback=entry[1],duration=Number.isFinite(el.duration)?el.duration:playback.duration;
  let position=playback.position+(playback.playing?Math.max(0,(Date.now()+timeOffset-playback.updated)/1000):0);
  if(duration)position=Math.min(position,duration);
  const ended=playback.ended===true||Boolean(duration&&position>=duration);
  return {url:entry[0],playback,position,playing:playback.playing&&!ended,ended};
}
function publishMediaMetadata(el){
  if(state?.me!=='host'||connection!=='online'||!Number.isFinite(el.duration)||el.duration<=0||!playbackFor(el))return;
  const record=mediaSync.get(el),key=`${state.current.id}|${el.src}|${el.duration}`;
  if(record.metadataFor===key)return;record.metadataFor=key;
  act('media_metadata',{url:playbackFor(el).url,question:state.current.id,duration:el.duration});
}
function mediaEvent(el,event){
  const target=playbackFor(el),record=mediaSync.get(el);if(!target||!record)return;
  if(state.paused){syncMedia(el,true);return;}
  if(state.me!=='host'){syncMedia(el,true);return;}
  if(event==='pause'&&target.ended)return;
  if(event==='seeked'&&record.seekTarget!==null&&Math.abs(el.currentTime-record.seekTarget)<.35){record.seekTarget=null;return;}
  record.seekTarget=null;
  const playing=!el.paused&&!el.ended;
  if(playing===target.playing&&Math.abs(el.currentTime-target.position)<.5&&el.ended===target.ended)return;
  act('media',{url:target.url,question:state.current.id,playing,position:el.currentTime,ended:el.ended});
}
function syncMedia(el,force=false){
  const target=playbackFor(el),record=mediaSync.get(el);if(!target||!record)return;
  const key=JSON.stringify([target.playback.playing,target.playback.position,target.playback.updated,target.playback.ended]);
  if(state.me==='host'&&!force&&record.key===key)return;
  record.key=key;
  if(el.readyState>=1&&(Math.abs(el.currentTime-target.position)>.65||(target.ended&&Math.abs(el.currentTime-target.position)>.01))){
    record.seekTarget=target.position;
    try{el.currentTime=target.position;}catch{record.seekTarget=null;}
  }
  if(target.playing&&el.paused&&!record.blocked&&!record.pending&&!record.error){
    record.pending=true;
    el.play().then(()=>{record.blocked=false;blockedMedia.delete(el);paintMediaStatus(el);paintMediaPermission();}).catch(error=>{
      if(!el.isConnected)return;
      if(error.name==='NotAllowedError'){record.blocked=true;blockedMedia.add(el);}
      else if(error.name!=='AbortError')record.error=true;
      paintMediaStatus(el);paintMediaPermission();
    }).finally(()=>{record.pending=false;});
  }
  if(!target.playing){record.blocked=false;blockedMedia.delete(el);if(!el.paused)el.pause();}
  paintMediaStatus(el);paintMediaPermission();
}
function paintMediaStatus(el){
  const label=el.closest('.controlled-media')?.querySelector('.media-follow-status');if(!label)return;
  const record=mediaSync.get(el),target=playbackFor(el);
  const text=record?.error?'Не удалось воспроизвести запись':record?.blocked?'Нажми «Разрешить звук» сверху':target?.ended?'Запись закончилась':target?.playing?'Воспроизводится · управляет ведущий':'Пауза · управляет ведущий';
  if(label.textContent!==text)label.textContent=text;
}
function paintMediaPermission(){
  for(const el of blockedMedia)if(!el.isConnected)blockedMedia.delete(el);
  const button=$('#enable-media');if(button)button.hidden=!blockedMedia.size;
}
function retryBlockedMedia(){
  if(!blockedMedia.size)return;unlockSound();
  for(const el of [...blockedMedia]){const record=mediaSync.get(el);if(record){record.blocked=false;blockedMedia.delete(el);syncMedia(el,true);}}
  paintMediaPermission();
}
setInterval(()=>{if(state?.me!=='host')for(const el of app.querySelectorAll('audio,video'))syncMedia(el);},500);
document.addEventListener('pointerdown',retryBlockedMedia);
document.addEventListener('keydown',retryBlockedMedia);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state?.me!=='host')for(const el of app.querySelectorAll('audio,video'))syncMedia(el);});
function bind(selector,action){$(selector)?.addEventListener('click',()=>act(action));}
function updateTimer(){const el=$('#timer');if(!el||!state)return;const remaining=state.paused?state.pauseRemainingMs:state.deadline?state.deadline-Date.now()-timeOffset:null;if(remaining===null)return;const seconds=Math.max(0,Math.ceil(remaining/1000));el.textContent=String(seconds).padStart(2,'0');el.classList.toggle('urgent',seconds<=5);}
setInterval(updateTimer,150);
setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'ping',sent:Date.now()}));},10000);
async function upload(event){const file=event.target.files[0];if(!file)return;if(file.size>512*1024*1024){toast('Пакет больше 512 МБ. Выберите пакет поменьше.');return;}uploadBusy=true;render();try{const result=await request(`/api/pack?room=${session.code}`,file);toast(result.warnings.length?'Пакет загружен. Обратите внимание на предупреждения в лобби.':'Пакет загружен. Можно начинать!');}catch(error){toast('Не удалось загрузить пакет: '+error.message);}finally{uploadBusy=false;render();}}
async function copy(text,message){try{await navigator.clipboard.writeText(text);toast(message);}catch{const input=document.createElement('textarea');input.value=text;document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();if(ok)toast(message);else prompt('Скопируйте ссылку:',text);}}
async function invite(){try{meta=await request('/api/info');}catch{}await copy(`${shareOrigin()}/?room=${state.code}`,meta.shareMode==='radmin'?'Приглашение скопировано. Друзья должны быть в одной сети Radmin VPN.':meta.publicUrl?'Приглашение скопировано. Отправь друзьям!':'Ссылка для локальной сети скопирована. Для игры через Radmin запусти START-RADMIN.cmd.');}
let scorePlayer;
function openScore(id,mode='set'){scorePlayer=id;const p=state.players.find(p=>p.id===id);$('#score-name').textContent=p.name;$('#score-mode').value=mode;$('#score-input').value=mode==='add'?100:p.score;updateScorePreview();$('#score-dialog').showModal();$('#score-input').select();}
function updateScorePreview(){
  const p=state?.players.find(p=>p.id===scorePlayer);if(!p)return;
  const add=$('#score-mode').value==='add',input=$('#score-input'),value=Number(input.value),result=add?p.score+value:value;
  $('#score-input-label').textContent=add?'Сколько добавить или снять':'Новый счёт';
  $('#score-current').textContent=`Сейчас: ${num(p.score)}`;
  $('#score-result').textContent=Number.isFinite(result)?`Будет: ${num(result)}`:'';
  $('#score-help').textContent=add?'Положительное число добавит баллы, отрицательное снимет. Например: 500 или −200.':'Укажи точный итоговый счёт игрока.';
  $('#score-submit').textContent=add?(value<0?'Снять баллы':'Добавить баллы'):'Установить счёт';
  input.setCustomValidity(input.value!==''&&(!Number.isSafeInteger(value)||Math.abs(result)>10000000||(add&&value===0))?'Введите целое число. Итоговый счёт — в пределах ±10 000 000.':'');
}
$('#score-mode').addEventListener('change',()=>{const p=state.players.find(p=>p.id===scorePlayer);$('#score-input').value=$('#score-mode').value==='add'?100:p.score;updateScorePreview();});
$('#score-input').addEventListener('input',updateScorePreview);
$('#score-form').addEventListener('submit',e=>{e.preventDefault();const add=$('#score-mode').value==='add';act(add?'adjust_score':'score',{player:scorePlayer,...(add?{delta:Number($('#score-input').value)}:{score:Number($('#score-input').value)})});$('#score-dialog').close();});
$('#close-score').onclick=()=>$('#score-dialog').close();$('#help-button').onclick=()=>$('#help-dialog').showModal();$('#close-help').onclick=()=>$('#help-dialog').close();
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!state?.paused&&!['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')&&['reading','buzzing'].includes(state?.status)&&state.me!=='host'&&!state.attempted.includes(state.me)&&!(state.passed||[]).includes(state.me)&&(!state.questionPlayers||state.questionPlayers.includes(state.me))){e.preventDefault();if(!e.repeat)act('buzz');}});
document.addEventListener('pointerdown',unlockSound,{once:true});
window.addEventListener('online',()=>{if(session&&socket?.readyState!==WebSocket.OPEN)connect();});
request('/api/info').then(v=>meta=v).catch(()=>{});
home();
const code=new URLSearchParams(location.search).get('room')?.toUpperCase();
const seat=new URLSearchParams(location.hash.slice(1)).get('seat');
const saved=code?storage.get(`svoya:${code}`):null;
if(code&&seat&&/^[a-f0-9]{48}$/.test(seat))enter({code,token:seat});else if(saved)enter(saved);



