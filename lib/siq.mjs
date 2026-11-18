import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { randomBytes } from 'node:crypto';

const list = v => v == null ? [] : Array.isArray(v) ? v : [v];
const val = v => typeof v === 'object' && v !== null ? String(v['#text'] ?? '') : String(v ?? '');
const safeDecode = s => { try { return decodeURIComponent(s); } catch { return s; } };
const mimeTypes = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', avif:'image/avif', mp3:'audio/mpeg', ogg:'audio/ogg', wav:'audio/wav', m4a:'audio/mp4', aac:'audio/aac', mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime' };

export function importSiq(buffer) {
  if (buffer.length > 512 * 1024 * 1024) throw new Error('Пакет больше 512 МБ. Выберите пакет поменьше.');
  let total = 0;
  const zip = unzipSync(new Uint8Array(buffer), { filter(entry) {
    if (entry.originalSize > 256 * 1024 * 1024) throw new Error('Один из файлов пакета больше 256 МБ.');
    total += entry.originalSize;
    if (total > 1024 * 1024 * 1024) throw new Error('Распакованный пакет больше 1 ГБ.');
    return true;
  } });
  const xmlName = Object.keys(zip).find(n => n.toLowerCase() === 'content.xml');
  if (!xmlName) throw new Error('В .siq не найден content.xml. Нужен пакет вопросов SIGame.');
  const xml = strFromU8(zip[xmlName]);
  if (xml.length > 8 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Неподдерживаемый XML в пакете.');
  if (XMLValidator.validate(xml) !== true) throw new Error('Файл content.xml повреждён.');
  const root = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: true, processEntities: true }).parse(xml).package;
  if (!root) throw new Error('Это не пакет SIGame.');
  const assets = [];
  const assetMap = new Map();
  const warnings = new Set();
  const fileIndex = new Map(Object.keys(zip).map(n => [safeDecode(n).toLowerCase(), n]));

  function content(items, old = false) {
    const texts = [], media = [];
    for (const item of list(items)) {
      const type = item?.['@_type'] || 'text';
      const text = val(item);
      if (type === 'marker') continue;
      if (type === 'text') { if (text) texts.push(text); continue; }
      const kind = type === 'voice' ? 'audio' : type;
      if (!['image', 'audio', 'video'].includes(kind)) { warnings.add('HTML и служебные элементы пропущены.'); continue; }
      const internal = text.startsWith('@') || String(item['@_isRef']).toLowerCase() === 'true';
      if (!internal) {
        if (/^https?:\/\//i.test(text)) media.push({ type: kind, url: text });
        else warnings.add('Некоторые медиафайлы не найдены.');
        continue;
      }
      const folder = { image:'Images', audio:'Audio', video:'Video' }[kind];
      const ref = safeDecode(text.replace(/^@/, '')).replaceAll('\\', '/');
      const key = fileIndex.get(`${folder}/${ref}`.toLowerCase()) || fileIndex.get(ref.toLowerCase());
      if (!key) { warnings.add('Некоторые медиафайлы не найдены.'); continue; }
      const ext = key.split('.').pop().toLowerCase();
      const mime = mimeTypes[ext];
      if (!mime || !mime.startsWith(kind + '/')) { warnings.add('Неподдерживаемые форматы медиа пропущены.'); continue; }
      let asset = assetMap.get(key);
      if (!asset) {
        asset = { id: randomBytes(16).toString('hex'), mime, data: zip[key] };
        assetMap.set(key, asset); assets.push(asset);
      }
      media.push({ type:kind, asset:asset.id, bytes:asset.data.length });
    }
    return { text:texts.join('\n\n').slice(0, 24000), media };
  }

  function duration(value){
    const s=String(value||'');if(!s)return 0;
    const parts=s.split(':').map(Number);
    const n=parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:Number(s);
    return Number.isFinite(n)&&n>0?Math.min(86400,n):0;
  }
  function stages(items){
    const result=[];let batch=[];
    const flush=(extra={})=>{if(!batch.length)return;const c=content(batch);if(c.text||c.media.length)result.push({...c,...extra});batch=[];};
    for(const item of list(items)){
      if(item?.['@_type']==='marker')continue;
      const type=item?.['@_type']||'text',seconds=duration(item?.['@_duration']||item?.['@_time']);
      const wait=String(item?.['@_waitForFinish']??'true').toLowerCase()!=='false';
      batch.push(item);
      if(seconds||['audio','voice','video'].includes(type)&&wait)flush({duration:seconds,waitForFinish:wait});
    }
    flush();return result;
  }

  let count = 0;
  const rounds = list(root.rounds?.round).map((round, r) => ({
    name: String(round['@_name'] || `Раунд ${r + 1}`).slice(0, 100),
    type: String(round['@_type'] || '').toLowerCase(),
    themes: list(round.themes?.theme).map((theme, t) => ({
      name: String(theme['@_name'] || `Тема ${t + 1}`).slice(0, 120),
      questions: list(theme.questions?.question).map((q, i) => {
        if (++count > 1500) throw new Error('В пакете больше 1500 вопросов.');
        const questionType = q['@_type'] || q.type?.['@_name'] || 'simple';
        if (!['simple','default','','withButton','auction','stake','cat','bagcat','secret','secretPublicPrice','secretNoQuestion','sponsored','noRisk','forYourself','forAll','stakeAll'].includes(questionType)) warnings.add(`Особый тип «${String(questionType).slice(0,50)}» играется как обычный вопрос.`);
        const params=list(q.params?.param),oldParams=list(q.type?.param);
        const parameter=name=>params.find(p=>p['@_name']===name)||oldParams.find(p=>p['@_name']===name);
        let question, answerContent, questionItems=[],answerItems=[],options = [];
        if (q.scenario) {
          const atoms = list(q.scenario.atom);
          const marker = atoms.findIndex(a => a?.['@_type'] === 'marker');
          questionItems=marker<0?atoms:atoms.slice(0,marker);answerItems=marker<0?[]:atoms.slice(marker+1);
          question = content(questionItems, true);
          answerContent = content(answerItems, true);
        } else {
          const questionParam = params.find(p => p['@_name'] === 'question');
          const answerParam = params.find(p => p['@_name'] === 'answer');
          questionItems=questionParam?.item || (questionParam ? [questionParam] : []);answerItems=answerParam?.item || [];
          question = content(questionItems);
          answerContent = content(answerItems);
          const optionsParam = params.find(p => p['@_name'] === 'answerOptions');
          options = list(optionsParam?.param).map(p => ({ key:String(p['@_name'] || ''), ...content(p.item || []) }));
        }
        const rightAnswers=list(q.right?.answer).map(val).filter(Boolean);
        const answer = rightAnswers.map(a => {const o = options.find(o=>o.key===a);return o ? `${a}: ${o.text}` : a;}).join(' / ') || answerContent.text || 'Ответ не указан в пакете';
        if (!question.text && !question.media.length&&questionType!=='secretNoQuestion') { question.text = 'Содержимое вопроса не поддерживается. Ведущий может пропустить его.'; warnings.add('Есть вопросы с неподдерживаемым сценарием.'); }
        const parsedPrice = Number(q['@_price']);
        const price=Number.isFinite(parsedPrice)&&parsedPrice>0?Math.min(parsedPrice,1000000):(i+1)*100;
        const priceParam=parameter('price'),set=priceParam?.numberSet;
        const oldCost=val(parameter('cost')).split(';').map(Number);
        const min=Number(set?.['@_minimum']??(oldCost[0]>0?oldCost[0]:val(priceParam)||price));
        const max=Number(set?.['@_maximum']??(oldCost[1]>0?oldCost[1]:min));
        const step=Number(set?.['@_step']??(oldCost[2]>0?oldCost[2]:1));
        const answerType=val(parameter('answerType'))||(options.length?'select':'text');
        if(q.script)warnings.add('Пользовательские скрипты пакета не исполняются; используется содержимое параметров вопроса.');
        return { id:`${r}-${t}-${i}`, price, type:questionType, text:question.text, media:question.media, stages:stages(questionItems),answerStages:stages(answerItems),options, answer:answer.slice(0, 12000), answerMedia:answerContent.media,rightAnswers,
          answerType:['number','point','select','text'].includes(answerType)?answerType:'text',answerDeviation:Math.max(0,Number(val(parameter('answerDeviation')))||0),answerDuration:Math.min(600,Math.max(5,Number(val(parameter('answerDuration')))||15)),
          special:{theme:val(parameter('theme')).slice(0,120),selectionMode:val(parameter('selectionMode'))||(val(parameter('self'))==='true'?'any':'exceptCurrent'),min:Number.isFinite(min)?Math.max(0,Math.min(1000000,min)):price,max:Number.isFinite(max)?Math.max(min,Math.min(1000000,max)):price,step:Number.isFinite(step)?Math.max(0,step):1} };
      }),
    })).filter(t => t.questions.length),
  })).filter(r => r.themes.length);
  if (!rounds.length) throw new Error('В пакете нет доступных вопросов.');
  return { pack:{ name:String(root['@_name'] || 'Пакет SIQ').slice(0, 150), author:list(root.info?.authors?.author).map(val).join(', ').slice(0, 200), rounds, warnings:[...warnings] }, assets };
}

