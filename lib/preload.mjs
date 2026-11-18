import {createHash} from 'node:crypto';
const manifests=new WeakMap();
export const allQuestionMedia=q=>[...(q?.media||[]),...(q?.answerMedia||[]),...(q?.options||[]).flatMap(o=>o.media||[]),...(q?.stages||[]).flatMap(s=>s.media||[]),...(q?.answerStages||[]).flatMap(s=>s.media||[])];
export function preloadManifest(room){
  let rounds=manifests.get(room.pack);if(!rounds){rounds=new Map();manifests.set(room.pack,rounds);}
  if(rounds.has(room.round))return rounds.get(room.round);
  const unique=new Map();
  for(const t of room.pack.rounds[room.round].themes)for(const q of t.questions)for(const m of allQuestionMedia(q)){
    if(m.url&&['image','audio','video'].includes(m.type))unique.set(m.url,{url:m.url,type:m.type,bytes:m.bytes||0});
  }
  const assets=[...unique.values()],id=createHash('sha256').update(JSON.stringify([room.code,room.round,assets])).digest('hex').slice(0,20);
  const manifest={id,round:room.round,assets};rounds.set(room.round,manifest);return manifest;
}
export function reportPreload(room,user,body){
  const manifest=preloadManifest(room),total=manifest.assets.length;
  if(body.id!==manifest.id)throw new Error('Список предзагрузки изменился.');
  for(const key of ['loaded','failed'])if(!Number.isInteger(body[key])||body[key]<0||body[key]>total)throw new Error('Некорректный прогресс загрузки.');
  if(body.loaded+body.failed>total)throw new Error('Некорректный прогресс загрузки.');
  if(room.preloadProgress?.id!==manifest.id)room.preloadProgress={id:manifest.id,entries:{}};
  room.preloadProgress.entries[user.id]={loaded:body.loaded,failed:body.failed};
}
export function preloadView(room,connected){
  const manifest=preloadManifest(room),total=manifest.assets.length;
  if(!total)return null;
  const progress=room.preloadProgress?.id===manifest.id?room.preloadProgress.entries:{};
  const people=[room.host,...room.players].filter(p=>connected.has(p.id)).map(p=>({id:p.id,name:p.name,...(progress[p.id]||{loaded:0,failed:0}),total}));
  return {...manifest,people,done:people.length>0&&people.every(p=>p.loaded===total)};
}
