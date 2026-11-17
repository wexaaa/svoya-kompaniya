// All decisions live on the server. Public views never contain sealed submissions.
export const finalActive = room => Boolean(room.final && room.status.startsWith('final_'));
export function isFinalRound(room) {
  const round = room.pack.rounds[room.round];
  return round?.type === 'final' || (room.round === room.pack.rounds.length - 1 && /финал|final/i.test(round?.name || ''));
}
export function beginFinal(room, log) {
  if (!room.players.length) throw new Error('Для финала нужен хотя бы один игрок.');
  const round=room.pack.rounds[room.round];
  if (!round?.themes.length || round.themes.some(t=>t.questions.length!==1)) throw new Error('В каждой теме финала должен быть ровно один вопрос.');
  const participants=[...room.players].sort((a,b)=>a.score-b.score);
  room.final={ removed:[], turn:0, order:participants.map(p=>p.id), entries:Object.fromEntries(participants.map(p=>[p.id,{balance:p.score,bet:null,answer:null,correct:null}])), theme:null };
  room.current=null;room.buzz=null;room.attempted=[];room.playback={};room.deadline=null;room.chooser=null;
  room.status='final_eliminate';
  if(round.themes.length===1) openBets(room);
  log(room,'Начинается финал. Первым убирает тему игрок с наименьшим счётом.');
}
function openBets(room) {
  const remaining=room.pack.rounds[room.round].themes.map((t,i)=>i).filter(i=>!room.final.removed.includes(i));
  room.final.theme=remaining[0];
  room.current=room.pack.rounds[room.round].themes[remaining[0]].questions[0].id;
  room.status='final_bet';
}
export function closeFinalAnswers(room,log) {
  for(const e of Object.values(room.final.entries)) if(e.answer===null)e.answer='';
  room.status='final_review';room.deadline=null;
  log(room,'Ответы финала приняты. Ведущий проверяет их.');
}
export function finalAction(room,user,body,log) {
  const host=user.id==='host',hostOnly=()=>{if(!host)throw new Error('Это действие доступно только ведущему.');};
  const requirePhase=phase=>{if(room.status!==phase||!room.final)throw new Error('Этот этап финала уже завершён или ещё не начался.');};
  const entry=()=>{const e=room.final?.entries[user.id];if(!e||host)throw new Error('Вы не участвуете в этом финале.');return e;};
  switch(body.action){
    case 'final_start':
      hostOnly();if(room.status!=='board'||!isFinalRound(room))throw new Error('Финал запускается из табло финального раунда.');
      beginFinal(room,log);break;
    case 'final_remove':{
      requirePhase('final_eliminate');
      const f=room.final,current=f.order[f.turn%f.order.length];
      if(!host&&user.id!==current)throw new Error('Сейчас очередь другого игрока.');
      const index=body.theme;
      if(!Number.isInteger(index)||!room.pack.rounds[room.round].themes[index]||f.removed.includes(index))throw new Error('Эта тема недоступна.');
      f.removed.push(index);f.turn++;
      const name=room.players.find(p=>p.id===current)?.name || 'Игрок';
      log(room,`${name} убирает тему «${room.pack.rounds[room.round].themes[index].name}»${host?' (по решению ведущего)':''}`);
      if(room.pack.rounds[room.round].themes.length-f.removed.length===1)openBets(room);
      break;
    }
    case 'final_bet':{
      requirePhase('final_bet');const e=entry();
      if(e.bet!==null)throw new Error('Ставка уже принята и не меняется.');
      if(typeof body.bet!=='number'||!Number.isSafeInteger(body.bet)||body.bet<0||body.bet>Math.max(0,e.balance))throw new Error('Ставка должна быть целым числом от 0 до вашего счёта.');
      e.bet=body.bet;
      if(Object.values(room.final.entries).every(e=>e.bet!==null)){room.status='final_reading';log(room,'Все ставки приняты. Открывается финальный вопрос.');}
      break;
    }
    case 'final_fill_bets':
      hostOnly();requirePhase('final_bet');
      for(const e of Object.values(room.final.entries))if(e.bet===null)e.bet=0;
      room.status='final_reading';log(room,'Ведущий завершает приём ставок. Неподанные ставки равны нулю.');break;
    case 'final_open_answers':
      hostOnly();requirePhase('final_reading');room.status='final_answer';room.deadline=Date.now()+60000;
      log(room,'На письменный ответ в финале — 60 секунд.');break;
    case 'final_answer':{
      requirePhase('final_answer');const e=entry();
      if(room.deadline&&Date.now()>=room.deadline)throw new Error('Время на ответ вышло.');
      if(e.answer!==null)throw new Error('Ответ уже отправлен и не меняется.');
      if(typeof body.answer!=='string'||body.answer.trim().length>2000||!body.answer.trim())throw new Error('Введите ответ длиной от 1 до 2000 символов.');
      e.answer=body.answer.trim();
      if(Object.values(room.final.entries).every(e=>e.answer!==null))closeFinalAnswers(room,log);
      break;
    }
    case 'final_close_answers':hostOnly();requirePhase('final_answer');closeFinalAnswers(room,log);break;
    case 'final_judge':{
      hostOnly();requirePhase('final_review');
      const e=room.final.entries[body.player];
      if(!e||typeof body.correct!=='boolean')throw new Error('Выберите игрока и оценку ответа.');
      // Store a decision first. Scores change atomically only when results are published.
      e.correct=body.correct;break;
    }
    case 'final_publish':
      hostOnly();requirePhase('final_review');
      if(Object.values(room.final.entries).some(e=>e.correct===null))throw new Error('Сначала оцените ответ каждого игрока.');
      for(const [id,e]of Object.entries(room.final.entries)){
        const p=room.players.find(p=>p.id===id);if(p){p.score=e.balance+(e.correct?e.bet:-e.bet);log(room,`${p.name}: финал ${e.correct?'+':'−'}${e.bet}, итог ${p.score}`);}
      }
      room.status='final_results';room.deadline=null;break;
    default:return false;
  }
  return true;
}
export function finalView(room,user) {
  if(!room.final)return null;
  const f=room.final,host=user.id==='host',published=['final_results','finished'].includes(room.status);
  const selected=room.pack.rounds[room.round].themes[f.theme];
  const me=f.entries[user.id];
  return {
    phase:room.status,removed:f.removed,turn:f.order[f.turn%f.order.length],order:f.order,theme:f.theme,themeName:selected?.name || null,
    mine:me?{balance:me.balance,maxBet:Math.max(0,me.balance),bet:me.bet,answer:me.answer}:null,
    participants:f.order.map(id=>{
      const e=f.entries[id],p=room.players.find(p=>p.id===id);
      const result={id,name:p?.name || 'Игрок',balance:e.balance,betSubmitted:e.bet!==null,answerSubmitted:e.answer!==null};
      if(published||(host&&room.status==='final_review'))Object.assign(result,{bet:e.bet,answer:e.answer,correct:e.correct,delta:e.correct?e.bet:-e.bet});
      return result;
    }),
  };
}
