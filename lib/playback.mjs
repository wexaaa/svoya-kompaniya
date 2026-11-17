export const questionMedia=q=>[...(q?.media||[]),...(q?.options||[]).flatMap(o=>o.media||[])].filter(m=>['audio','video'].includes(m.type));
export const positionAt=(entry,now=Date.now())=>Math.min(entry.duration??86400,entry.position+(entry.playing?Math.max(0,now-entry.updated)/1000:0));
export function startPlayback(room,items,{restart=false,now=Date.now()}={}){
  room.playback ||= {};
  for(const item of items||[])if(['audio','video'].includes(item.type)&&(restart||!room.playback[item.url])){
    const duration=room.playback[item.url]?.duration;
    room.playback[item.url]={playing:true,position:0,ended:false,updated:now,...(duration?{duration}:{})};
  }
}
export function stopPlayback(room,now=Date.now()){
  for(const entry of Object.values(room.playback||{}))if(entry.playing){entry.position=positionAt(entry,now);entry.playing=false;entry.updated=now;}
}
export function answerPlayback(room,q){stopPlayback(room);startPlayback(room,q?.answerMedia,{restart:true});}
export function tickPlayback(room,now=Date.now()){
  let changed=false;
  for(const entry of Object.values(room.playback||{}))if(entry.playing&&entry.duration&&positionAt(entry,now)>=entry.duration){
    entry.position=entry.duration;entry.playing=false;entry.ended=true;entry.updated=now;changed=true;
  }
  return changed;
}
