const pendingPoints=new Map();let observer;
const kind=q=>q?.answerType||(q?.options?.length?'select':'text');
const labels={stake:'Аукцион',secret:'Кот в мешке',secretPublicPrice:'Кот в мешке · открытая цена',secretNoQuestion:'Кот без вопроса',noRisk:'Вопрос без риска',forAll:'Отвечают все',stakeAll:'Ставки для всех'};
export function sequenceHtml(s){return s.sequence&&s.sequence.total>1?`<span class="sequence-label">Этап ${s.sequence.index+1} / ${s.sequence.total}</span>${s.me==='host'&&s.sequence.hasNext?'<button class="button small ghost" id="next-content">Следующий этап →</button>':''}`:'';}
export function answerInput(s,{esc,context='regular',allowed=true}){
  const q=s.current,k=kind(q),entry=context==='all'?s.advanced.entries?.[s.me]:context==='final'?s.final?.mine?.answer!==null?{text:s.final?.mine?.answer}:null:s.responses?.[s.me];
  if(entry)return `<div class="final-sealed">✓ Ответ принят${entry.text?`: <strong>${esc(entry.text)}</strong>`:''}. Ждём проверки.</div>`;
  if(!allowed)return '';
  if(k==='select')return '';
  const key=`${s.code}|${q.id}|${context}`,point=pendingPoints.get(key);
  return `<form class="structured-form" id="structured-answer" data-answer-context="${context}"><label for="structured-value">${k==='number'?'Ответ числом':k==='point'?'Выбери точку на изображении':'Твой ответ'}</label>${k==='point'?`<p class="point-help" id="point-coordinate">${point?`Выбрано: ${(point.x*100).toFixed(1)}%, ${(point.y*100).toFixed(1)}%`:'Нажми на нужное место картинки. Точку можно изменить до отправки.'}</p>`:k==='number'?'<input class="final-input" id="structured-value" type="text" inputmode="decimal" maxlength="40" required autocomplete="off" placeholder="Введите число">':'<textarea class="final-input" id="structured-value" rows="2" maxlength="2000" required placeholder="Напиши ответ"></textarea>'}<button class="button primary" type="submit" ${k==='point'&&!point?'disabled':''}>Отправить ответ →</button></form>`;
}
export function advancedHtml(s,{esc,num,mediaHtml,clockHtml}){
  const a=s.advanced,host=s.me==='host',q=s.current;if(!a||!q)return null;
  const title=labels[a.type]||(a.all?'Отвечают все':'Вопрос');
  const heading=`<div class="area-top"><b>${esc(s.board.name)}</b><span>${title}</span></div>`;
  const player=id=>s.players.find(p=>p.id===id)?.name||'Игрок';
  const hidden=['auction','secret','secret_price','all_bet'].includes(s.status);
  if(hidden){
    let body='';
    if(s.status==='auction'){
      const auction=a.auction,turn=auction.turn,can=host||s.me===turn,max=auction.limits.find(p=>p.id===turn)?.max||q.price,min=auction.leader?auction.bid+1:q.price;
      body=`<h2>Аукцион за право ответить</h2><p>Ставку делает <strong>${esc(player(turn))}</strong>.</p><p class="auction-current">${auction.leader?`Лидирует ${esc(player(auction.leader))} · <b>${num(auction.bid)}</b>`:`Начальная стоимость: ${num(q.price)}`}</p><p class="muted">Можно поставить весь свой счёт. При небольшом счёте доступна номинальная стоимость вопроса.</p>${can?`<form id="auction-form" class="special-form"><label for="auction-bet">Ставка от ${num(min)} до ${num(max)}</label><input class="final-input" id="auction-bet" type="number" min="${min}" max="${max}" step="1" value="${Math.min(min,max)}" required><div class="row"><button class="button primary" ${min>max?'disabled':''}>Сделать ставку</button><button type="button" class="button ghost" id="auction-allin" ${min>max?'disabled':''}>Ва-банк · ${num(max)}</button></div></form><button class="button ghost" id="auction-pass">Пас на аукционе</button>`:'<div class="final-sealed">Ждём ставку игрока.</div>'}<div class="final-presence">${s.players.map(p=>`<div><b>${esc(p.name)}</b><span>${auction.passed.includes(p.id)?'Пас':auction.leader===p.id?num(auction.bid):auction.turn===p.id?'Сейчас ставит':'Ждёт'}</span></div>`).join('')}</div>`;
    }else if(s.status==='secret'){
      const can=host||s.me===a.selector;
      body=`<h2>Кому достанется кот?</h2><p>Получателя выбирает <strong>${esc(player(a.selector))}</strong>.</p>${q.theme?`<p class="muted">Категория: ${esc(q.theme)}</p>`:''}${a.type==='secretPublicPrice'?`<p>Стоимость: ${num(a.special.min)}–${num(a.special.max)}</p>`:''}<div class="special-recipients">${a.candidates.map(id=>`<button class="button" data-secret-player="${id}" ${!can?'disabled':''}>${esc(player(id))}</button>`).join('')}</div>${!a.candidates.length?'<p>Нет доступного получателя. Ведущий может пропустить вопрос.</p>':''}`;
    }else if(s.status==='secret_price'){
      const can=host||s.me===a.recipient,min=a.special.min??q.price,max=a.special.max??min;
      body=`<h2>Кот для ${esc(player(a.recipient))}</h2><p>${can?'Выбери стоимость вопроса.':'Получатель выбирает стоимость вопроса.'}</p>${can?`<form class="special-form" id="secret-price-form"><label for="secret-price">От ${num(min)} до ${num(max)}${a.special.step>1?` · шаг ${num(a.special.step)}`:''}</label><input class="final-input" id="secret-price" type="number" min="${min}" max="${max}" step="${a.special.step||1}" value="${min}" required><button class="button primary">${a.type==='secretNoQuestion'?'Получить баллы':'Открыть вопрос'} →</button></form>`:''}`;
    }else{
      const mine=a.bets.find(p=>p.id===s.me);
      body=`<h2>Скрытые ставки для всех</h2><p>Сначала ставки, затем вопрос и одновременные ответы.</p>${mine?mine.submitted?'<div class="final-sealed">✓ Ставка принята</div>':`<form class="special-form" id="all-bet-form"><label for="all-bet">От 0 до ${num(mine.max)}</label><input class="final-input" id="all-bet" type="number" min="0" max="${mine.max}" step="1" required><button class="button primary">Зафиксировать ставку</button></form>`:''}<div class="final-presence">${a.bets.map(p=>`<div><b>${esc(player(p.id))}</b><span>${p.submitted?'✓ Принято':'Ожидаем'}</span></div>`).join('')}</div>${host?'<button class="button ghost" id="all-fill-bets">Завершить приём · неподанные ставки = 0</button>':''}`;
    }
    return `${heading}<div class="special-stage"><span class="eyebrow">${title}</span>${body}</div>${host&&s.status!=='all_bet'?'<div class="question-controls"><button class="button ghost" id="reveal-button">Пропустить и показать ответ</button></div>':''}`;
  }
  if(!a.all||!['all_answer','all_review'].includes(s.status))return null;
  const review=s.status==='all_review',mine=a.entries?.[s.me],can=!host&&!mine&&s.questionPlayers.includes(s.me)&&!s.paused;
  const options=q.options?.length?`<div class="answer-options">${q.options.map((o,i)=>`<button class="answer-option button" data-all-option="${i}" ${!can?'disabled':''}><b>${esc(o.key)}</b><span>${esc(o.text)}</span><div class="media-container">${mediaHtml(o.media)}</div></button>`).join('')}</div>`:'';
  let panel='';
  if(review&&host){
    panel=`<div class="answer-box"><span class="eyebrow">Правильный ответ</span><p>${esc(q.answer)}</p></div><div class="all-review-list">${s.questionPlayers.map(id=>{const e=a.entries[id];return `<article class="final-review-card"><b>${esc(player(id))}</b><p>${esc(e.text)}</p>${e.value&&typeof e.value==='object'?`<button class="button small ghost" data-review-point="${id}">Показать точку</button>`:''}<div class="row"><button class="button small ${e.correct===true?'good':'ghost'}" data-all-judge="${id}" data-correct="true">✓ Верно</button><button class="button small ${e.correct===false?'bad':'ghost'}" data-all-judge="${id}" data-correct="false">× Неверно</button></div><small>${e.correct===null?'Оцени ответ':e.correct?'Будет засчитан':'Не будет засчитан'}</small></article>`;}).join('')}</div><button class="button primary" id="all-publish" ${Object.values(a.entries).some(e=>e.correct===null)?'disabled':''}>Начислить баллы →</button>`;
  }else if(review)panel='<div class="final-sealed">Все ответы приняты. Ведущий проверяет результаты.</div>';
  else{
    panel=options+answerInput(s,{esc,context:'all',allowed:can});
    if(can)panel+='<button class="button ghost" id="all-pass">Пас</button>';
    panel+=`<div class="final-presence">${s.questionPlayers.map(id=>`<div><b>${esc(player(id))}</b><span>${a.entries[id]?'✓ Принято':'Ожидаем ответ'}</span></div>`).join('')}</div>`;
    if(host)panel+='<button class="button ghost" id="all-close">Завершить приём ответов</button>';
  }
  return `${heading}<div class="advanced-live"><div class="question-stage ${(q.media||[]).some(m=>['image','video'].includes(m.type))?'with-visual':''}"><div class="question-meta"><span class="question-category">Категория · ${esc(q.theme)}</span><strong>${num(q.price)}</strong>${clockHtml()}${sequenceHtml(s)}</div><p class="question-text">${esc(q.text)}</p><div class="media-container">${mediaHtml(q.media)}</div></div><aside class="advanced-response">${panel}</aside></div>`;
}
export function bindAdvanced(s,{act,toast,esc}){
  const find=id=>document.getElementById(id),send=(action,extra={})=>act(action,{question:s.current?.id,...extra});
  const bind=(id,fn)=>find(id)?.addEventListener('click',fn),form=(id,fn)=>find(id)?.addEventListener('submit',event=>{event.preventDefault();fn();});
  bind('next-content',()=>send('next_stage'));
  const turn=s.advanced?.auction?.turn;
  form('auction-form',()=>send('auction_bid',{bet:Number(find('auction-bet').value),player:turn}));
  bind('auction-allin',()=>send('auction_bid',{bet:s.advanced.auction.limits.find(p=>p.id===turn).max,player:turn}));
  bind('auction-pass',()=>send('auction_pass',{player:turn}));
  form('secret-price-form',()=>send('secret_price',{price:Number(find('secret-price').value)}));
  for(const b of document.querySelectorAll('[data-secret-player]'))b.onclick=()=>send('secret_player',{player:b.dataset.secretPlayer});
  form('all-bet-form',()=>send('all_bet',{bet:Number(find('all-bet').value)}));
  for(const [id,action] of [['all-fill-bets','all_fill_bets'],['all-pass','all_pass'],['all-close','all_close'],['all-publish','all_publish']])bind(id,()=>send(action));
  for(const b of document.querySelectorAll('[data-all-option]'))b.onclick=()=>send('submit_answer',{value:Number(b.dataset.allOption)});
  for(const b of document.querySelectorAll('[data-final-option]'))b.onclick=()=>send('final_answer',{value:Number(b.dataset.finalOption)});
  for(const b of document.querySelectorAll('[data-all-judge]'))b.onclick=()=>send('all_judge',{player:b.dataset.allJudge,correct:b.dataset.correct==='true'});
  const inputForm=find('structured-answer'),context=inputForm?.dataset.answerContext,key=`${s.code}|${s.current?.id}|${context}`;
  form('structured-answer',()=>{
    let value;if(kind(s.current)==='point')value=pendingPoints.get(key);
    else if(kind(s.current)==='number'){
      const raw=find('structured-value').value.trim().replace(',','.');value=raw===''?NaN:Number(raw);
      if(!Number.isFinite(value)){toast('Введите число. Дробную часть можно отделить запятой или точкой.');return;}
    }else value=find('structured-value').value;
    send(context==='final'?'final_answer':'submit_answer',{value});
  });
  observer?.disconnect();observer=null;
  if(kind(s.current)==='point'){
    const image=document.querySelector('.question-stage>.media-container img');if(!image)return;
    const parent=image.parentElement;parent.classList.add('point-surface');
    function geometry(){const rect=image.getBoundingClientRect(),p=parent.getBoundingClientRect(),scale=Math.min(rect.width/image.naturalWidth,rect.height/image.naturalHeight);return {left:rect.left-p.left+(rect.width-image.naturalWidth*scale)/2,top:rect.top-p.top+(rect.height-image.naturalHeight*scale)/2,width:image.naturalWidth*scale,height:image.naturalHeight*scale};}
    let shown=[];
    function draw(points){shown=points;parent.querySelectorAll('.point-marker').forEach(el=>el.remove());if(!image.naturalWidth)return;const g=geometry();for(const [i,p]of points.entries()){if(!p)continue;const marker=document.createElement('span');marker.className='point-marker '+(p.correct?'right-point':'');marker.style.left=`${g.left+p.x*g.width}px`;marker.style.top=`${g.top+p.y*g.height}px`;marker.textContent=p.correct?'✓':String(i+1);parent.append(marker);}}
    const mine=context==='final'?s.final?.mine?.value:context==='all'?s.advanced?.entries[s.me]?.value:s.responses?.[s.me]?.value;
    const right=s.current.rightPoints||[],initial=pendingPoints.get(key)||mine;
    const defaults=[...(initial&&typeof initial==='object'?[initial]:[]),...right.map(p=>({...p,correct:true}))];
    draw(defaults);image.addEventListener('load',()=>draw(shown));observer=new ResizeObserver(()=>draw(shown));observer.observe(image);
    if(inputForm){
      const choose=p=>{pendingPoints.set(key,p);draw([p]);find('point-coordinate').textContent=`Выбрано: ${(p.x*100).toFixed(1)}%, ${(p.y*100).toFixed(1)}%`;inputForm.querySelector('button').disabled=false;};
      image.classList.add('point-selectable');image.tabIndex=0;image.setAttribute('role','button');image.setAttribute('aria-label','Выбрать точку на картинке. Стрелки перемещают точку.');
      image.onclick=event=>{const g=geometry(),p=parent.getBoundingClientRect(),x=(event.clientX-p.left-g.left)/g.width,y=(event.clientY-p.top-g.top)/g.height;if(x>=0&&x<=1&&y>=0&&y<=1)choose({x,y});};
      image.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const p={...(pendingPoints.get(key)||{x:.5,y:.5})};if(event.key==='ArrowLeft')p.x-=.01;if(event.key==='ArrowRight')p.x+=.01;if(event.key==='ArrowUp')p.y-=.01;if(event.key==='ArrowDown')p.y+=.01;p.x=Math.max(0,Math.min(1,p.x));p.y=Math.max(0,Math.min(1,p.y));choose(p);};
    }else{image.onclick=null;image.onkeydown=null;image.classList.remove('point-selectable');image.removeAttribute('role');image.removeAttribute('tabindex');image.removeAttribute('aria-label');}
    for(const b of document.querySelectorAll('[data-review-point]'))b.onclick=()=>draw([s.advanced.entries[b.dataset.reviewPoint].value,...right.map(p=>({...p,correct:true}))]);
  }
}
