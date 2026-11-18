import {answerKind,validateResponse,suggestedVerdict,responseText} from './answers.mjs';

export const specialType=q=>({auction:'stake',cat:'secret',bagcat:'secret',sponsored:'noRisk',forYourself:'noRisk'}[q?.type]||q?.type||'simple');
const allTypes=new Set(['forAll','stakeAll']);
export const isAllQuestion=room=>!!room.advanced?.all;
export const effectivePrice=(room,q)=>room.advanced&&(room.advanced.type==='stake'||room.advanced.type.startsWith('secret'))?room.advanced.price:q.price;
export const noRisk=room=>room.advanced?.noRisk===true;
export function setupAdvanced(room,q,selector,open,log){
  const type=specialType(q),selecting=selector.id==='host'?room.chooser||room.players[0]?.id:selector.id;
  const all=allTypes.has(type)||room.mode==='all'&&['simple','default','withButton'].includes(type);
  room.responses={};
  room.advanced={type,selector:selecting,price:q.price,noRisk:type==='noRisk',recipient:null,all,entries:{}};
  if(type==='stake'){
    const order=[...room.questionPlayers];const i=order.indexOf(selecting);if(i>0)order.push(...order.splice(0,i));
    room.advanced.auction={order,turn:order[0],passed:[],leader:null,bid:0};room.status='auction';room.deadline=null;
    log(room,'Аукцион: делайте ставки за право ответить.');return;
  }
  if(type.startsWith('secret')){room.status='secret';room.deadline=null;log(room,'Кот в мешке: выберите получателя вопроса.');return;}
  if(type==='noRisk'){room.advanced.recipient=selecting;room.questionPlayers=[selecting];}
  if(type==='stakeAll'){
    room.advanced.bets=Object.fromEntries(room.questionPlayers.map(id=>[id,{max:Math.max(0,room.players.find(p=>p.id===id).score),value:null}]));
    room.status='all_bet';room.deadline=null;return;
  }
  open();
}
function closeAll(room,q,log){
  for(const id of room.questionPlayers)if(!Object.hasOwn(room.advanced.entries,id))room.advanced.entries[id]={value:null,correct:false};
  for(const entry of Object.values(room.advanced.entries))entry.correct=suggestedVerdict(q,entry.value);
  room.status='all_review';room.deadline=null;
  log(room,'Ответы приняты. Ведущий проверяет результаты.');
}
export function closeAllAnswers(room,q,log){closeAll(room,q,log);}
function secretCandidates(room,q){
  const mode=q.special?.selectionMode||'exceptCurrent',selector=room.advanced.selector;
  return room.players.filter(p=>room.questionPlayers.includes(p.id)&&(mode==='current'?p.id===selector:mode==='any'||p.id!==selector));
}
export function advancedAction(room,user,body,{q,open,reveal,log}){
  const host=user.id==='host',a=room.advanced;
  const requireHost=()=>{if(!host)throw new Error('Это действие доступно только ведущему.');};
  const participant=()=>{if(host||!room.questionPlayers.includes(user.id))throw new Error('Вы не участвуете в этом вопросе.');};
  const match=()=>{if(body.question!==room.current)throw new Error('Этот вопрос уже завершён.');};
  switch(body.action){
    case 'auction_bid':case 'auction_pass':{
      match();if(room.status!=='auction'||!a?.auction)throw new Error('Аукцион завершён.');
      const auction=a.auction,id=host?body.player:user.id;
      if(id!==auction.turn)throw new Error('Сейчас очередь другого игрока.');
      const player=room.players.find(p=>p.id===id),max=Math.max(q.price,player.score);
      if(body.action==='auction_bid'){
        const value=body.bet,minimum=auction.leader?auction.bid+1:q.price;
        if(!Number.isSafeInteger(value)||value<minimum||value>max)throw new Error(`Ставка от ${minimum} до ${max}.`);
        auction.bid=value;auction.leader=id;log(room,`${player.name}: ставка ${value}`);
      }else{auction.passed.push(id);log(room,`${player.name}: пас на аукционе`);}
      const remaining=auction.order.filter(p=>!auction.passed.includes(p)&&p!==auction.leader);
      if(!remaining.length){
        if(auction.leader){a.recipient=auction.leader;a.price=auction.bid;room.questionPlayers=[a.recipient];open();}
        else{reveal();log(room,'Все отказались от аукциона.');}
      }else{
        const index=auction.order.indexOf(id);
        auction.turn=Array.from({length:auction.order.length},(_,i)=>auction.order[(index+i+1)%auction.order.length]).find(p=>remaining.includes(p));
      }
      return true;
    }
    case 'secret_player':{
      match();if(room.status!=='secret'||!a)throw new Error('Выбор получателя уже завершён.');
      if(!host&&user.id!==a.selector)throw new Error('Получателя выбирает открывший вопрос игрок.');
      if(!secretCandidates(room,q).some(p=>p.id===body.player))throw new Error('Выберите доступного получателя.');
      a.recipient=body.player;room.status='secret_price';return true;
    }
    case 'secret_price':{
      match();if(room.status!=='secret_price'||!a)throw new Error('Стоимость уже выбрана.');
      if(!host&&user.id!==a.recipient)throw new Error('Стоимость выбирает получатель вопроса.');
      const {min=q.price,max=q.price,step=1}=q.special||{},price=body.price;
      if(!Number.isSafeInteger(price)||price<min||price>max||(step>0&&(price-min)%step!==0))throw new Error('Выберите стоимость из диапазона пакета.');
      a.price=price;room.questionPlayers=[a.recipient];
      log(room,`Кот в мешке: ${room.players.find(p=>p.id===a.recipient).name}, ${price} баллов`);
      if(a.type==='secretNoQuestion'){
        const p=room.players.find(p=>p.id===a.recipient);p.score+=price;room.chooser=p.id;reveal();room.autoBoard=true;room.deadline=Date.now()+5000;
      }else open();
      return true;
    }
    case 'all_bet':case 'all_fill_bets':{
      match();if(room.status!=='all_bet'||!a?.bets)throw new Error('Приём ставок завершён.');
      if(body.action==='all_fill_bets'){requireHost();for(const e of Object.values(a.bets))if(e.value===null)e.value=0;}
      else{
        participant();const e=a.bets[user.id];
        if(!e||e.value!==null||!Number.isSafeInteger(body.bet)||body.bet<0||body.bet>e.max)throw new Error('Введите допустимую ставку. Отправленную ставку изменить нельзя.');
        e.value=body.bet;
      }
      if(Object.values(a.bets).every(e=>e.value!==null))open();return true;
    }
    case 'submit_answer':{
      match();participant();
      const simultaneous=isAllQuestion(room),kind=answerKind(q);
      if(simultaneous){if(room.status!=='all_answer')throw new Error('Приём ответов завершён.');}
      else if(room.status!=='answering'||room.buzz!==user.id||!['text','number','point'].includes(kind))throw new Error('Сначала нажмите «Знаю ответ».');
      if(room.deadline&&Date.now()>=room.deadline)throw new Error('Время вышло.');
      const responses=simultaneous?a.entries:room.responses;
      if(Object.hasOwn(responses,user.id))throw new Error('Ответ уже принят.');
      const value=validateResponse(q,body.value);
      responses[user.id]={value,correct:null};
      if(simultaneous){if(room.questionPlayers.every(id=>Object.hasOwn(responses,id)))closeAll(room,q,log);}
      else room.deadline=null;
      log(room,`${user.name} отправляет ответ`);return true;
    }
    case 'all_pass':{
      match();participant();if(!isAllQuestion(room)||room.status!=='all_answer'||Object.hasOwn(a.entries,user.id))throw new Error('Пас недоступен.');
      if(room.deadline&&Date.now()>=room.deadline)throw new Error('Время вышло.');
      a.entries[user.id]={value:null,correct:false};room.passed.push(user.id);log(room,`${user.name}: пас`);
      if(room.questionPlayers.every(id=>Object.hasOwn(a.entries,id)))closeAll(room,q,log);return true;
    }
    case 'all_close':requireHost();match();if(room.status!=='all_answer')throw new Error('Приём уже завершён.');closeAll(room,q,log);return true;
    case 'all_judge':{
      requireHost();match();if(room.status!=='all_review'||!a?.entries[body.player]||typeof body.correct!=='boolean')throw new Error('Выберите ответ и оценку.');
      a.entries[body.player].correct=body.correct;return true;
    }
    case 'all_publish':{
      requireHost();match();if(room.status!=='all_review'||Object.values(a.entries).some(e=>e.correct===null))throw new Error('Сначала оцените все ответы.');
      for(const [id,e]of Object.entries(a.entries)){
        const p=room.players.find(p=>p.id===id),price=a.bets?.[id]?.value??effectivePrice(room,q);
        e.delta=e.value===null?0:e.correct?price:room.minus&&!a.noRisk?-price:0;p.score+=e.delta;
        log(room,`${p.name}: ${e.correct?'верно':'неверно'} (${e.delta>=0?'+':''}${e.delta})`);
      }
      const winner=room.questionPlayers.find(id=>a.entries[id].correct);if(winner)room.chooser=winner;
      const wrong=room.questionPlayers.filter(id=>a.entries[id].value!==null&&!a.entries[id].correct);
      if(wrong.length)room.wrongAnswer={players:wrong,until:Date.now()+1000};
      reveal();room.autoBoard=true;room.deadline=Date.now()+5000;return true;
    }
    default:return false;
  }
}
export function advancedView(room,user,q){
  const a=room.advanced;if(!a)return null;
  const host=user.id==='host',published=room.status==='revealed',review=room.status==='all_review';
  return {type:a.type,selector:a.selector,recipient:a.recipient,price:a.price,noRisk:a.noRisk,all:a.all,
    candidates:room.status==='secret'?secretCandidates(room,q).map(p=>p.id):[],
    special:q?.special||{},auction:a.auction?{...a.auction,limits:room.players.map(p=>({id:p.id,max:Math.max(q.price,p.score)}))}:null,
    bets:a.bets?Object.entries(a.bets).map(([id,e])=>({id,submitted:e.value!==null,...(id===user.id||published?e:{})})):null,
    entries:Object.fromEntries(Object.entries(a.entries||{}).map(([id,e])=>[id,{submitted:true,...(published||host&&review?{...e,text:responseText(q,e.value)}:id===user.id?{value:e.value,text:responseText(q,e.value)}:{})}]))};
}
