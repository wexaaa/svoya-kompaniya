import {stopPlayback} from './playback.mjs';
import {randomUUID} from 'node:crypto';

export function sendChat(room,user,text,now=Date.now()){
  if(typeof text!=='string')throw new Error('Введите сообщение.');
  text=text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();
  if(!text||text.length>500)throw new Error('Сообщение должно содержать от 1 до 500 символов.');
  const last=(room.chat||[]).findLast(message=>message.author===user.id);
  if(last&&now-last.time<1000)throw new Error('Подождите секунду перед следующим сообщением.');
  room.chat ||= [];
  room.chat.push({id:randomUUID(),author:user.id,name:user.name,text,time:now});
  room.chat=room.chat.slice(-100);
}

export function pauseRoom(room,now=Date.now()){
  if(['lobby','finished'].includes(room.status))throw new Error('Пауза доступна во время игры.');
  if(room.pause)throw new Error('Игра уже на паузе.');
  room.pause={started:now,remainingMs:room.deadline===null||room.deadline===undefined?null:Math.max(0,room.deadline-now),resumeMedia:Object.entries(room.playback||{}).filter(([,entry])=>entry.playing).map(([url])=>url)};
  room.deadline=null;
  stopPlayback(room,now);
}

export function resumeRoom(room,now=Date.now()){
  if(!room.pause)throw new Error('Игра уже продолжается.');
  const pause=room.pause;
  room.deadline=pause.remainingMs===null?null:now+pause.remainingMs;
  for(const url of pause.resumeMedia){const entry=room.playback?.[url];if(entry&&!entry.ended){entry.playing=true;entry.updated=now;}}
  delete room.pause;
}
