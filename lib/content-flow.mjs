import {startPlayback,stopPlayback,questionMedia} from './playback.mjs';
export const contentStages=(q,phase='question')=>phase==='answer'?(q?.answerStages||[]):(q?.stages||[]);
export function currentContent(room,q){
  const seq=room.sequence,stages=contentStages(q,seq?.phase);
  if(seq&&stages.length)return stages[seq.index]||stages.at(-1);
  return {text:q?.text||'',media:q?.media||[]};
}
export function beginSequence(room,q,phase='question'){
  const stages=contentStages(q,phase);
  room.sequence=stages.length?{phase,index:0,until:null}:null;
  if(room.sequence)playStage(room,q);
}
function playStage(room,q){
  stopPlayback(room);
  const content=currentContent(room,q);
  startPlayback(room,content.media,{restart:true});
  room.sequence.until=content.duration>0?Date.now()+content.duration*1000:null;
}
export function nextStage(room,q){
  const seq=room.sequence,stages=contentStages(q,seq?.phase);
  if(!seq||seq.index+1>=stages.length)throw new Error('Это последний этап вопроса.');
  seq.index++;playStage(room,q);
  if(seq.phase==='question')room.deadline=null;
}
export function hasNextStage(room,q){return !!room.sequence&&room.sequence.index+1<contentStages(q,room.sequence.phase).length;}
export function waitingForContent(room,q){
  if(hasNextStage(room,q))return true;
  if(room.sequence?.until>Date.now())return true;
  const content=room.sequence?currentContent(room,q):q;
  return questionMedia(content).some(m=>!room.playback?.[m.url]?.ended);
}
export function tickSequence(room,q){
  const seq=room.sequence;
  if(!seq||room.pause||!['buzzing','all_answer','final_reading','revealed','final_results','final_review'].includes(room.status))return false;
  if(!hasNextStage(room,q)){if(seq.until&&Date.now()>=seq.until){seq.until=null;return true;}return false;}
  const c=currentContent(room,q),media=questionMedia(c);
  if(seq.until?Date.now()>=seq.until:c.waitForFinish!==false&&media.length&&media.every(m=>room.playback?.[m.url]?.ended)){
    nextStage(room,q);return true;
  }
  return false;
}
