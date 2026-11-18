import { randomBytes } from 'node:crypto';
import { demoPack } from './demo.mjs';
import { finalAction, finalActive, finalView, isFinalRound, beginFinal, closeFinalAnswers } from './final.mjs';
import {questionMedia,startPlayback,stopPlayback,answerPlayback,tickPlayback} from './playback.mjs';
import {sendChat,pauseRoom,resumeRoom} from './room-tools.mjs';
import {answerKind,validateResponse,suggestedVerdict,responseText} from './answers.mjs';
import {setupAdvanced,advancedAction,advancedView,isAllQuestion,effectivePrice,noRisk,closeAllAnswers} from './advanced.mjs';
import {beginSequence,currentContent,nextStage,hasNextStage,waitingForContent,tickSequence} from './content-flow.mjs';
import {preloadView} from './preload.mjs';

export const token = () => randomBytes(24).toString('hex');
export function createRoom(code, name) {
  return { code, host:{ id:'host', name:cleanName(name), token:token() }, players:[], pack:demoPack(), status:'lobby', round:0, used:[], current:null, buzz:null, attempted:[], chooser:null, deadline:null, seconds:20, minus:true, locked:false, log:[], revision:0, created:Date.now() };
}
export function cleanName(name) {
  const value = String(name || '').trim().slice(0, 24);
  if (!value) throw new Error('Введите имя.');
  return value;
}
export function authenticate(room, auth) {
  if (auth === room.host.token) return room.host;
  const player = room.players.find(p => p.token === auth);
  if (!player) throw new Error('Сессия не найдена. Войдите в комнату заново.');
  return player;
}
export function addPlayer(room, name) {
  if (room.locked || room.status === 'finished' || finalActive(room)) throw new Error('Вход в комнату закрыт на время финала или после завершения игры.');
  if (room.players.length >= 12) throw new Error('В комнате уже 12 игроков.');
  name = cleanName(name);
  if ([room.host, ...room.players].some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('Это имя уже занято.');
  const player = { id:randomBytes(6).toString('hex'), token:token(), name, score:0, ready:false };
  room.players.push(player);
  addLog(room, `${name} присоединяется к игре`);
  room.revision++;
  return player;
}
const addLog = (room, text) => { room.log.unshift({ text, time:Date.now() }); room.log = room.log.slice(0, 35); };
export const question = room => room.pack.rounds[room.round]?.themes.flatMap(t => t.questions).find(q => q.id === room.current);
const clearQuestion = room => { room.current = null; room.buzz = null; room.attempted = []; room.passed = []; room.questionPlayers = []; room.optionSelections = {}; room.responses={};room.advanced=null;room.sequence=null;room.deadline = null; room.autoBoard=false; room.wrongAnswer=null; room.playback = {}; };
const awaitingMedia = room => waitingForContent(room,question(room));
const eligiblePlayers = room => room.questionPlayers?.length?room.questionPlayers:room.players.map(p=>p.id);

function openQuestion(room){
  const q=question(room);room.status=isAllQuestion(room)?'all_answer':'buzzing';
  if(q.stages?.length)beginSequence(room,q);else startPlayback(room,questionMedia(q));
  room.deadline=awaitingMedia(room)?null:Date.now()+(isAllQuestion(room)?Math.max(room.seconds,q.answerDuration||30):room.seconds)*1000;
}
function revealQuestion(room){
  room.status='revealed';room.deadline=null;room.autoBoard=false;answerPlayback(room,question(room));
  beginSequence(room,question(room),'answer');
}
function selectQuestion(room,q,user){
  clearQuestion(room);room.current=q.id;room.used.push(q.id);room.questionPlayers=room.players.map(p=>p.id);
  setupAdvanced(room,q,user,()=>openQuestion(room),addLog);
}
function sequentialQuestion(room){
  if(room.mode!=='all'||isFinalRound(room))return;
  const q=room.pack.rounds[room.round].themes.flatMap(t=>t.questions).find(q=>!room.used.includes(q.id));
  if(q)selectQuestion(room,q,room.host);
}

function claimAnswer(room,user){
  if(user.id==='host')throw new Error('Ведущий не участвует в ответах.');
  if(!['reading','buzzing'].includes(room.status))throw new Error('Кнопка пока закрыта или другой игрок был быстрее.');
  if(room.deadline&&Date.now()>=room.deadline)throw new Error('Время вышло.');
  if(room.attempted.includes(user.id))throw new Error('Вы уже отвечали на этот вопрос.');
  if((room.passed||[]).includes(user.id)||!eligiblePlayers(room).includes(user.id))throw new Error('Вы пропускаете этот вопрос. Следующая попытка — в новом вопросе.');
  room.buzz=user.id;room.attempted.push(user.id);room.status='answering';room.deadline=Date.now()+(question(room).answerDuration||15)*1000;
  addLog(room,`${user.name} нажимает кнопку`);
}

function judge(room, correct, multiplier=1) {
  const player = room.players.find(p => p.id === room.buzz);
  if (!player) throw new Error('Никто не отвечает.');
  const q = question(room);
  const price=effectivePrice(room,q);
  const delta = correct ? Math.round(price*multiplier) : room.minus&&!noRisk(room) ? -price : 0;
  player.score += delta;
  addLog(room, `${player.name}: ${correct ? 'верно' : 'неверно'} (${delta >= 0 ? '+' : ''}${delta})`);
  if (correct) { room.chooser = player.id; revealQuestion(room); room.autoBoard=true; room.deadline = Date.now()+5000; }
  else {
    room.wrongAnswer={player:player.id,until:Date.now()+1000};
    room.buzz = null;
    room.status = eligiblePlayers(room).every(id => room.attempted.includes(id)||(room.passed||[]).includes(id)) ? 'revealed' : 'buzzing';
    room.deadline = room.status === 'buzzing'&&!awaitingMedia(room) ? Date.now() + room.seconds * 1000 : null;
    if(room.status==='revealed')revealQuestion(room);
  }
}

export function action(room, user, body) {
  const host = user.id === 'host';
  const hostOnly = () => { if (!host) throw new Error('Это действие доступно только ведущему.'); };
  if(body.action==='chat'){sendChat(room,user,body.text);room.revision++;return;}
  if(body.action==='pause'||body.action==='resume'){
    hostOnly();
    if(body.action==='pause'){pauseRoom(room);addLog(room,'Ведущий ставит игру на паузу');}
    else{resumeRoom(room);addLog(room,'Ведущий продолжает игру');}
    room.revision++;return;
  }
  if(room.pause&&body.action!=='media_metadata')throw new Error('Игра на паузе. Дождитесь продолжения ведущим.');
  if(advancedAction(room,user,body,{q:question(room),open:()=>openQuestion(room),reveal:()=>revealQuestion(room),log:addLog})){if(room.status==='all_review')stopPlayback(room);room.revision++;return;}
  if(body.action==='next_stage'){
    hostOnly();if(body.question!==room.current)throw new Error('Этот вопрос уже завершён.');
    if(!['buzzing','all_answer','final_reading','revealed','final_review','final_results'].includes(room.status))throw new Error('Сейчас нельзя переключить этап.');
    nextStage(room,question(room));if(!awaitingMedia(room)&&['buzzing','all_answer'].includes(room.status))room.deadline=Date.now()+(room.status==='all_answer'?Math.max(room.seconds,question(room).answerDuration||30):room.seconds)*1000;
    room.revision++;return;
  }
  const previousStatus=room.status;
  if(finalAction(room,user,body,addLog)){
    if(previousStatus!==room.status){
      if(room.status==='final_reading'){startPlayback(room,questionMedia(question(room)));beginSequence(room,question(room));}
      if(['final_review','final_results'].includes(room.status)){answerPlayback(room,question(room));beginSequence(room,question(room),'answer');}
    }
    room.revision++;return;
  }
  switch (body.action) {
    case 'ready':
      if (host || room.status !== 'lobby') throw new Error('Готовность меняется в лобби.');
      user.ready = !user.ready; break;
    case 'settings':
      hostOnly();
      if(room.status==='lobby'&&body.mode!==undefined&&!['classic','all'].includes(body.mode))throw new Error('Неизвестный режим игры.');
      if (typeof body.locked === 'boolean') room.locked = body.locked;
      if (room.status === 'lobby') { room.minus = body.minus !== false; room.seconds = [10,20,30,60].includes(Number(body.seconds)) ? Number(body.seconds) : 20; }
      if(room.status==='lobby'&&body.mode!==undefined){if(!['classic','all'].includes(body.mode))throw new Error('Неизвестный режим игры.');room.mode=body.mode;}
      break;
    case 'start':
      hostOnly();
      if (room.status !== 'lobby') throw new Error('Игра уже началась.');
      if (!room.players.length) throw new Error('Сначала пригласите хотя бы одного игрока.');
      if(isFinalRound(room))beginFinal(room,addLog);else{room.status='board';sequentialQuestion(room);}addLog(room, 'Игра началась. Удачи всем!'); break;
    case 'select': {
      if (!host && room.chooser !== user.id) throw new Error('Сейчас вопрос выбирает ведущий или игрок с верным ответом.');
      if (room.status !== 'board') throw new Error('Сначала завершите текущий вопрос.');
      const q = room.pack.rounds[room.round]?.themes.flatMap(t => t.questions).find(q => q.id === body.id);
      if (!q || room.used.includes(q.id)) throw new Error('Этот вопрос уже сыгран.');
      selectQuestion(room,q,user);break;
    }
    case 'arm':
      hostOnly();
      if(room.status==='buzzing')break; // Compatibility with older open tabs; never reset the timer.
      if (room.status !== 'reading') throw new Error('Кнопка уже открыта.');
      room.status = 'buzzing'; room.deadline = Date.now() + room.seconds * 1000; break;
    case 'choose_option': {
      const q=question(room);
      if(host||finalActive(room)||!q||body.question!==room.current)throw new Error('Выбор варианта недоступен для этого вопроса.');
      if(!Number.isInteger(body.option)||!q.options?.[body.option])throw new Error('Такого варианта ответа нет.');
      if(room.status!=='answering'||room.buzz!==user.id)throw new Error('Сначала нажмите «Знаю ответ» и дождитесь своей очереди.');
      if(room.deadline&&Date.now()>=room.deadline)throw new Error('Время вышло.');
      if(Object.hasOwn(room.optionSelections||{},user.id))throw new Error('Вариант уже выбран.');
      room.optionSelections ||= {};
      room.optionSelections[user.id]=body.option;
      room.deadline=null; // Submitted in time; wait for the host instead of timing out a saved answer.
      addLog(room,`${user.name} выбирает вариант ответа`);
      break;
    }
    case 'buzz':
      claimAnswer(room,user);break;
    case 'pass': {
      if(host||!['reading','buzzing'].includes(room.status)||!eligiblePlayers(room).includes(user.id))throw new Error('Пас доступен игрокам, пока открыта кнопка ответа.');
      if(room.deadline&&Date.now()>=room.deadline)throw new Error('Время вышло.');
      room.passed ||= [];
      if(room.passed.includes(user.id)||room.attempted.includes(user.id))throw new Error('Вы уже завершили этот вопрос.');
      room.passed.push(user.id);addLog(room,`${user.name}: пас`);
      if(eligiblePlayers(room).every(id=>room.passed.includes(id)||room.attempted.includes(id))){
        revealQuestion(room);addLog(room,'Все оставшиеся игроки спасовали. Показываем правильный ответ.');
      }
      break;
    }
    case 'judge':
      hostOnly(); if (room.status !== 'answering') throw new Error('Сейчас никто не отвечает.');
      if(body.multiplier!==undefined&&(![0.5,1,2].includes(body.multiplier)||(body.correct!==true&&body.multiplier!==1)))throw new Error('Выберите обычные, половинные или двойные баллы за верный ответ.');
      judge(room, body.correct === true, body.multiplier??1); break;
    case 'cancel_answer': {
      hostOnly();if(room.status!=='answering')throw new Error('Сейчас никто не отвечает.');
      const player=room.players.find(p=>p.id===room.buzz);if(!player)throw new Error('Игрок не найден.');
      room.attempted=room.attempted.filter(id=>id!==player.id);if(room.optionSelections)delete room.optionSelections[player.id];
      if(room.responses)delete room.responses[player.id];
      room.buzz=null;room.status='buzzing';room.deadline=awaitingMedia(room)?null:Date.now()+room.seconds*1000;
      addLog(room,`${player.name}: случайное нажатие отменено (0 баллов)`);break;
    }
    case 'media_metadata':
    case 'media': {
      hostOnly();
      const q = question(room);
      if(body.question!==undefined&&body.question!==room.current)throw new Error('Этот вопрос уже завершён.');
      if(finalActive(room)&&['final_eliminate','final_bet'].includes(room.status))throw new Error('Финальный вопрос ещё закрыт.');
      const content=currentContent(room,q);
      const allowed = room.sequence?[...(content.media||[]),...(room.sequence.phase==='question'?(q?.options||[]).flatMap(o=>o.media||[]):[])]:[...(q?.media || []), ...(q?.options || []).flatMap(o=>o.media || []), ...(['revealed','final_review','final_results'].includes(room.status) ? q?.answerMedia || [] : [])];
      if (!allowed.some(m=>m.url===body.url && ['video','audio'].includes(m.type))) throw new Error('Медиа недоступно.');
      room.playback ||= {};
      if(body.action==='media_metadata'){
        if(typeof body.duration!=='number'||!Number.isFinite(body.duration)||body.duration<=0||body.duration>86400)throw new Error('Некорректная длительность медиа.');
        const entry=room.playback[body.url];if(entry)entry.duration=body.duration;
        break;
      }
      const position = Number(body.position);
      if (!Number.isFinite(position) || position < 0 || position > 86400) throw new Error('Некорректная позиция медиа.');
      const duration=room.playback[body.url]?.duration;
      room.playback[body.url] = { playing:body.playing===true&&body.ended!==true, position:Math.min(position,duration??86400), ended:body.ended===true, updated:Date.now(),...(duration?{duration}:{}) };
      if(['buzzing','all_answer'].includes(room.status))room.deadline=awaitingMedia(room)?null:room.deadline||Date.now()+(room.status==='all_answer'?Math.max(room.seconds,q.answerDuration||30):room.seconds)*1000;
      break;
    }
    case 'reveal':
      hostOnly(); if (!['reading','buzzing','answering','auction','secret','secret_price'].includes(room.status)) throw new Error('Нет открытого вопроса.');
      revealQuestion(room);addLog(room, 'Ведущий показывает ответ'); break;
    case 'board':
      hostOnly(); if (room.status !== 'revealed') throw new Error('Сначала покажите ответ.');
      clearQuestion(room); room.status = 'board';sequentialQuestion(room);break;
    case 'nextRound': {
      hostOnly(); if (room.status !== 'board') throw new Error('Сначала вернитесь к табло.');
      if (room.round + 1 >= room.pack.rounds.length) throw new Error('Это последний раунд.');
      const next={...room,round:room.round+1};
      if(isFinalRound(next)&&next.pack.rounds[next.round].themes.some(t=>t.questions.length!==1))throw new Error('В каждой теме финала должен быть ровно один вопрос.');
      room.round++;clearQuestion(room);if(isFinalRound(room))beginFinal(room,addLog);else sequentialQuestion(room);addLog(room, `Начинается ${room.pack.rounds[room.round].name}`); break;
    }
    case 'finish':
      hostOnly();if(finalActive(room)&&room.status!=='final_results')throw new Error('Сначала завершите проверку финала.');room.status = 'finished'; room.deadline = null;stopPlayback(room);addLog(room, 'Игра завершена'); break;
    case 'restart':
      hostOnly(); if (room.status !== 'finished') throw new Error('Сначала завершите игру.');
      room.status = 'lobby'; room.round = 0; room.used = []; room.chooser = null; room.final=null;clearQuestion(room);
      room.players.forEach(p => { p.score = 0; p.ready = false; }); addLog(room, 'Новая игра'); break;
    case 'score': {
      hostOnly(); const p = room.players.find(p => p.id === body.player);
      if(room.final)throw new Error('В финале счёт определяется оценкой ответов и ставками.');
      const score = Number(body.score);
      if (!p || !Number.isInteger(score) || Math.abs(score) > 10000000) throw new Error('Некорректный счёт.');
      p.score = score; addLog(room, `Ведущий меняет счёт: ${p.name} → ${score}`); break;
    }
    case 'adjust_score': {
      hostOnly();
      if(room.final)throw new Error('В финале счёт определяется оценкой ответов и ставками.');
      const p=room.players.find(p=>p.id===body.player),delta=body.delta;
      if(!p||typeof delta!=='number'||!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>10000000||Math.abs(p.score+delta)>10000000)throw new Error('Введите целое ненулевое количество баллов. Итоговый счёт должен быть в пределах ±10 000 000.');
      p.score+=delta;
      addLog(room,`Ведущий ${delta>0?'добавляет':'снимает'} ${Math.abs(delta)} баллов: ${p.name} → ${p.score}`);
      break;
    }
    case 'give_turn': {
      hostOnly();
      if(room.final||isFinalRound(room))throw new Error('В финале действует очередь удаления тем.');
      if(!['lobby','board','revealed'].includes(room.status))throw new Error('Передать выбор следующего вопроса можно в лобби, на табло или после раскрытия ответа.');
      const p=room.players.find(p=>p.id===body.player);
      if(!p)throw new Error('Игрок не найден.');
      room.chooser=p.id;addLog(room,`Ведущий передаёт ход игроку ${p.name}`);
      break;
    }
    case 'kick':
      hostOnly(); if (room.status !== 'lobby') throw new Error('Удалять игроков можно в лобби.');
      room.players = room.players.filter(p => p.id !== body.player); break;
    default: throw new Error('Неизвестное действие.');
  }
  room.revision++;
}

export function tick(room) {
  if(room.pause)return false;
  const mediaChanged=tickPlayback(room),sequenceChanged=tickSequence(room,question(room));
  const contentChanged=mediaChanged||sequenceChanged;
  if(contentChanged&&['buzzing','all_answer'].includes(room.status)&&!room.deadline&&!awaitingMedia(room))room.deadline=Date.now()+(room.status==='all_answer'?Math.max(room.seconds,question(room).answerDuration||30):room.seconds)*1000;
  if (!room.deadline || Date.now() < room.deadline) {if(contentChanged)room.revision++;return contentChanged;}
  if(room.status==='all_answer'){closeAllAnswers(room,question(room),addLog);stopPlayback(room);room.revision++;return true;}
  if(room.status==='final_answer'){closeFinalAnswers(room,addLog);answerPlayback(room,question(room));beginSequence(room,question(room),'answer');room.revision++;return true;}
  if(room.status==='revealed'&&room.autoBoard){clearQuestion(room);room.status='board';sequentialQuestion(room);room.revision++;return true;}
  if (room.status === 'buzzing') { revealQuestion(room);addLog(room, 'Время на кнопку вышло'); }
  else if (room.status === 'answering') judge(room, false);
  else return false;
  room.revision++;
  return true;
}

export function view(room, user, connected = new Set(), latencies = new Map()) {
  const hiddenFinal=finalActive(room)&&['final_eliminate','final_bet'].includes(room.status);
  const hiddenSpecial=['auction','secret','secret_price','all_bet'].includes(room.status);
  const q = hiddenFinal?null:question(room), host = user.id === 'host';
  const content=q&&room.sequence?.phase!=='answer'?currentContent(room,q):q;
  const current = q ? { id:q.id, price:effectivePrice(room,q),text:hiddenSpecial?'':content.text,media:hiddenSpecial?[]:content.media,options:hiddenSpecial?[]:q.options || [],answerType:answerKind(q),answerDuration:q.answerDuration||15,theme:q.special?.theme||room.pack.rounds[room.round].themes.find(t => t.questions.some(x => x.id === q.id))?.name } : null;
  const revealFinal=room.status==='final_results'||room.status==='finished';
  const maySeeAnswer=finalActive(room)?revealFinal||(host&&room.status==='final_review'):!hiddenSpecial&&(isAllQuestion(room)?room.status==='revealed'||host&&room.status==='all_review':host||room.status==='revealed');
  if(current&&maySeeAnswer){current.answer=q.answer;current.answerMedia=q.answerMedia;}
  if(current&&maySeeAnswer&&room.sequence?.phase==='answer'){const c=currentContent(room,q);current.answerMedia=c.media;if(c.text)current.answer=c.text;}
  if(current&&maySeeAnswer&&answerKind(q)==='point'){current.rightPoints=(q.rightAnswers||[]).map(a=>a.split(',').map(Number)).filter(a=>a.length>=2&&a.every(Number.isFinite)).map(([x,y])=>({x,y}));}
  const responses=Object.fromEntries(Object.entries(room.responses||{}).filter(([id])=>host||room.status==='revealed'||id===user.id).map(([id,e])=>[id,{value:e.value,text:responseText(q,e.value),...(host||room.status==='revealed'?{suggested:suggestedVerdict(q,e.value)}:{})}]));
  const visibleMedia=new Set([...questionMedia(current),...(maySeeAnswer?q?.answerMedia||[]:[])].map(m=>m.url));
  const playback=Object.fromEntries(Object.entries(room.playback||{}).filter(([url])=>visibleMedia.has(url)));
  return {
    code:room.code, revision:room.revision, status:room.status, paused:Boolean(room.pause),pauseRemainingMs:room.pause?.remainingMs??null,chat:room.chat||[],wrongAnswer:room.wrongAnswer?.until>Date.now()?room.wrongAnswer:null, round:room.round, rounds:room.pack.rounds.length,
    pack:{ name:room.pack.name, author:room.pack.author, libraryId:room.pack.libraryId || null, warnings:room.pack.warnings, count:room.pack.rounds.reduce((n,r) => n + r.themes.reduce((s,t) => s + t.questions.length,0),0) },
    board:{ name:room.pack.rounds[room.round].name, final:isFinalRound(room), themes:room.pack.rounds[room.round].themes.map(t => ({ name:t.name, questions:t.questions.map(q => ({ id:q.id, price:q.price, used:room.used.includes(q.id) })) })) },
    host:{ id:'host', name:room.host.name, avatarUrl:room.host.avatarUrl||'', cameraUrl:room.host.cameraUrl||'', online:connected.has('host') },
    players:room.players.map(({ token, ...p }) => ({ ...p, online:connected.has(p.id), ...(host?{pingMs:connected.has(p.id)?latencies.get(p.id)?.ms??null:null}:{}) })),
    me:user.id, current, buzz:room.buzz, attempted:room.attempted, passed:room.passed||[], questionPlayers:eligiblePlayers(room), optionSelections:!hiddenFinal&&!finalActive(room)?Object.fromEntries(Object.entries(room.optionSelections||{}).filter(([id])=>host||room.status==='revealed'||id===user.id)):{}, chooser:room.chooser, deadline:room.deadline,autoBoard:room.status==='revealed'&&room.autoBoard===true,
    seconds:room.seconds, mode:room.mode||'classic',minus:room.minus, locked:room.locked, log:room.log, playback:hiddenFinal||hiddenSpecial?{}:playback, final:finalView(room,user),responses,advanced:q?advancedView(room,user,q):null,sequence:room.sequence?{index:room.sequence.index,total:(room.sequence.phase==='answer'?q?.answerStages:q?.stages)?.length||1,phase:room.sequence.phase,hasNext:hasNextStage(room,q)}:null,preload:preloadView(room,connected),now:Date.now(),
  };
}
