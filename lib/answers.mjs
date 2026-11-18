export function answerKind(q) { return q?.answerType || (q?.options?.length ? 'select' : 'text'); }
export function validateResponse(q, value) {
  const kind=answerKind(q);
  if(kind==='number'){
    if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e15)throw new Error('Введите конечное число.');
    return value;
  }
  if(kind==='point'){
    if(!value||typeof value!=='object'||!['x','y'].every(k=>typeof value[k]==='number'&&Number.isFinite(value[k])&&value[k]>=0&&value[k]<=1))throw new Error('Выберите точку внутри изображения.');
    return {x:value.x,y:value.y};
  }
  if(kind==='select'){
    if(!Number.isInteger(value)||!q.options?.[value])throw new Error('Выберите существующий вариант.');
    return value;
  }
  if(typeof value!=='string'||!value.trim()||value.trim().length>2000)throw new Error('Введите ответ длиной от 1 до 2000 символов.');
  return value.trim();
}
export function suggestedVerdict(q,value){
  if(value===null||value===undefined)return false;
  const answers=q.rightAnswers||[],deviation=Math.max(0,Number(q.answerDeviation)||0);
  if(answerKind(q)==='number'){
    const numbers=answers.map(a=>Number(String(a).replace(',','.'))).filter(Number.isFinite);
    return numbers.length?numbers.some(n=>Math.abs(n-value)<=deviation+1e-9):null;
  }
  if(answerKind(q)==='point'){
    const points=answers.map(a=>String(a).split(',').map(Number)).filter(a=>a.length>=2&&a.every(Number.isFinite));
    return points.length?points.some(([x,y,aspect=1])=>Math.hypot((value.x-x)*aspect,value.y-y)<=deviation+1e-9):null;
  }
  if(answerKind(q)==='select')return answers.length?answers.includes(String(q.options[value]?.key)):null;
  return null; // Spoken and written text stays under host control.
}
export function responseText(q,value){
  if(value===null||value===undefined)return 'Пас / нет ответа';
  if(answerKind(q)==='point')return `Точка: ${(value.x*100).toFixed(1)}%, ${(value.y*100).toFixed(1)}%`;
  if(answerKind(q)==='select'){const o=q.options[value];return `${o.key}: ${o.text}`;}
  return String(value);
}
