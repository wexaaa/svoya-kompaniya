export function finalHtml(s,{esc,num,mediaHtml,clockHtml}) {
  const f=s.final,host=s.me==='host',phase=s.status;
  if(!f)return '<p>Загружаем финал…</p>';
  const stages=['final_eliminate','final_bet','final_reading','final_answer','final_review','final_results'];
  const step=phase==='finished'?5:stages.indexOf(phase);
  const labels=['Темы','Ставки','Вопрос','Ответы','Проверка','Итоги'];
  const header=`<div class="area-top"><b>Финал · ${esc(s.board.name)}</b><span>Один вопрос решает всё</span></div><div class="final-steps">${labels.map((label,i)=>`<span class="${i===step?'active':i<step?'done':''}"><b>${i<step?'✓':i+1}</b>${label}</span>`).join('')}</div>`;
  const intro=(title,text)=>`<div class="final-intro"><span class="eyebrow">Финальный раунд</span><h2>${title}</h2><p>${text}</p></div>`;
  const list=(kind)=>`<div class="final-presence">${f.participants.map(p=>`<div>${p.id===s.me?'<b>Ты</b>':`<b>${esc(p.name)}</b>`}<span>${p[kind]?'✓ Принято':'Ожидаем'}</span></div>`).join('')}</div>`;
  let body='';
  if(phase==='final_eliminate'){
    const current=f.participants.find(p=>p.id===f.turn),can=host||s.me===f.turn;
    body=intro('Что оставим на финал?',`Сейчас тему убирает <strong>${esc(current?.name)}</strong>. ${host?'Можно удалить тему за игрока, если он отошёл.':'Убирайте темы по очереди, пока не останется одна.'}`)+
      `<div class="final-order">Очередь: ${f.order.map(id=>{const p=f.participants.find(p=>p.id===id);return `<span class="${id===f.turn?'gold':''}">${esc(p.name)} · ${num(p.balance)}</span>`;}).join('<span>→</span>')}</div><div class="final-themes">${s.board.themes.map((t,i)=>`<button class="final-theme ${f.removed.includes(i)?'removed':''}" data-final-theme="${i}" ${!can||f.removed.includes(i)?'disabled':''}><span>${esc(t.name)}</span><small>${f.removed.includes(i)?'Убрана':can?'Убрать тему ×':'Ждём своей очереди'}</small></button>`).join('')}</div>`;
  }else if(phase==='final_bet'){
    body=intro('На сколько ты уверен?',`Осталась тема <strong>${esc(f.themeName)}</strong>. Каждый делает одну скрытую ставку. Сам вопрос пока закрыт.`);
    if(!host&&f.mine){body+=f.mine.bet===null?`<form id="final-bet-form" class="final-form"><label for="final-bet-input">Твоя ставка · от 0 до ${num(f.mine.maxBet)}</label><div class="inline-form"><input class="final-input" id="final-bet-input" type="number" inputmode="numeric" min="0" max="${f.mine.maxBet}" step="1" required placeholder="Введите ставку"><button class="button primary" type="submit">Зафиксировать ставку</button></div><p class="form-note">Верный ответ: +ставка. Неверный: −ставка. После отправки ставку изменить нельзя.${f.mine.balance<=0?' При неположительном счёте доступна ставка 0.':''}</p></form>`:`<div class="final-sealed">✓ Твоя ставка ${num(f.mine.bet)} принята. Остальные её не видят.</div>`;}
    body+=list('betSubmitted');
    if(host)body+='<button class="button ghost small" id="final-fill-bets">Завершить приём · неподанные ставки = 0</button>';
  }else if(['final_reading','final_answer'].includes(phase)){
    const q=s.current;
    const visual=(q?.media||[]).some(m=>['image','video'].includes(m.type));
    const questionMarkup=`<div class="question-stage final-question ${visual?'with-visual':''}"><div class="question-meta"><span class="question-category">Категория · ${esc(f.themeName)}</span>${s.deadline?clockHtml(s):'<strong>Ставки закрыты</strong>'}</div><p class="question-text">${esc(q?.text)}</p><div class="media-container">${mediaHtml(q?.media)}</div></div>`;
    body=q?.options?.length?`<div class="answer-options final-options" aria-label="Варианты ответа финала">${q.options.map(o=>`<div><b>${esc(o.key)}</b><span>${esc(o.text)}</span><div class="media-container">${mediaHtml(o.media)}</div></div>`).join('')}</div>`:'';
    if(phase==='final_reading')body+=host?'<div class="final-sealed">Прочитай вопрос и воспроизведи медиа. Затем открой 60 секунд на письменные ответы.</div><button class="button primary" id="final-open-answers">Начать приём ответов · 60 секунд →</button>':'<div class="final-sealed">Прочитай вопрос. Ведущий скоро откроет поле для ответа.</div>';
    else{
      if(host)body+='<p class="muted">Игроки пишут ответы. После отправки всех ответов проверка откроется автоматически.</p><button class="button ghost small" id="final-close-answers">Завершить приём ответов сейчас</button>';
      else if(f.mine)body+=f.mine.answer===null?`<form id="final-answer-form" class="final-form"><label for="final-answer-input">Твой ответ · ставка ${num(f.mine.bet)}</label><textarea class="final-input" id="final-answer-input" maxlength="2000" rows="3" required placeholder="Напиши ответ. Его увидит ведущий после завершения приёма."></textarea><button class="button primary" type="submit">Отправить ответ →</button><p class="form-note">После отправки изменить ответ нельзя. Не произноси его вслух.</p></form>`:`<div class="final-sealed">✓ Ответ отправлен: <strong>${esc(f.mine.answer)}</strong><p>Ждём остальных игроков.</p></div>`;
      body+=list('answerSubmitted');
    }
    body=`${questionMarkup}<aside class="final-response-panel" aria-label="Ответ в финале">${body}</aside>`;
  }else if(phase==='final_review'){
    body=intro(host?'Кто разгадал финал?':'Ответы приняты',host?'Сравни ответы с правильным. Оцени каждого игрока, затем опубликуй результаты. Счёт изменится после публикации.':'Ведущий проверяет ответы. Ставки и ответы других игроков пока скрыты.');
    if(host){
      body+=`<div class="answer-box"><span class="eyebrow">Правильный ответ</span><p>${esc(s.current?.answer)}</p><div class="media-container">${mediaHtml(s.current?.answerMedia)}</div></div><div class="final-review-list">${f.participants.map(p=>`<article class="final-review-card"><div class="row space"><h3>${esc(p.name)}</h3><span class="pill">Ставка ${num(p.bet)}</span></div><p class="final-written">${p.answer?esc(p.answer):'<em>Ответ не отправлен</em>'}</p><div class="row"><button class="button small ${p.correct===true?'good':'ghost'}" data-final-judge="${p.id}" data-correct="true" aria-pressed="${p.correct===true}">✓ Верно</button><button class="button small ${p.correct===false?'bad':'ghost'}" data-final-judge="${p.id}" data-correct="false" aria-pressed="${p.correct===false}">× Неверно</button><small class="muted">${p.correct===null?'Ещё не оценён':`${p.correct?'+':'−'}${num(p.bet)}`}</small></div></article>`).join('')}</div><button class="button primary" id="final-publish" ${f.participants.some(p=>p.correct===null)?'disabled':''}>Начислить очки и показать итоги →</button>`;
    }else if(f.mine)body+=`<div class="final-sealed">Твоя ставка: <strong>${num(f.mine.bet)}</strong><p>Твой ответ: ${esc(f.mine.answer||'Ответ не отправлен')}</p></div>`;
  }else if(['final_results','finished'].includes(phase)){
    const sorted=[...f.participants].sort((a,b)=>(b.balance+b.delta)-(a.balance+a.delta));
    body=intro('Финал всё расставил по местам','Ставки раскрыты, ответы проверены. Вот как изменился счёт.');
    body+=`<div class="answer-box"><span class="eyebrow">Правильный ответ</span><p>${esc(s.current?.answer)}</p><div class="media-container">${mediaHtml(s.current?.answerMedia)}</div></div><div class="final-review-list">${sorted.map(p=>`<article class="final-review-card"><div class="row space"><h3>${esc(p.name)} ${p.id===s.me?'· ты':''}</h3><strong class="${p.correct?'gold':'negative'}">${num(p.balance+p.delta)}</strong></div><p class="final-written">${esc(p.answer||'Ответ не отправлен')}</p><div class="row space"><span class="muted">${p.correct?'✓ Верно':'× Неверно'} · ставка ${num(p.bet)}</span><span>${num(p.balance)} <b class="${p.correct?'gold':'negative'}">${p.correct?'+':'−'} ${num(p.bet)}</b> = ${num(p.balance+p.delta)}</span></div></article>`).join('')}</div>`;
    if(host)body+=phase==='finished'?'<button class="button primary" id="restart-button">Сыграть ещё раз ↗</button>':'<button class="button primary" id="finish-game">Завершить игру →</button>';
  }
  return `${header}<div class="final-content ${['final_reading','final_answer'].includes(phase)?'final-live-content':''}">${body}</div>`;
}
