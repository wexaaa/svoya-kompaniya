import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,addPlayer,action,view,tick,question} from '../lib/game.mjs';
import {sendChat,pauseRoom,resumeRoom} from '../lib/room-tools.mjs';

const setup=()=>{const room=createRoom('ABC234','Ведущий'),a=addPlayer(room,'Аня'),b=addPlayer(room,'Борис');const act=(user,name,extra={})=>action(room,user,{action:name,...extra});act(room.host,'start');act(room.host,'select',{id:'0-0-0'});return{room,a,b,act};};

test('chat validates text, records authenticated identity, limits spam and retains only 100 messages',()=>{
  const {room,a,b,act}=setup();
  for(const text of ['', '   ', null, 123, 'a'.repeat(501)]){const before=JSON.stringify(room);assert.throws(()=>act(a,'chat',{text}));assert.equal(JSON.stringify(room),before);}
  act(a,'chat',{text:' <img src=x onerror=alert(1)>\nПривет! ',name:'Ведущий',author:'host'});
  const msg=view(room,b).chat[0];assert.equal(msg.author,a.id);assert.equal(msg.name,'Аня');assert.equal(msg.text,'<img src=x onerror=alert(1)>\nПривет!');assert.equal(msg.token,undefined);
  assert.throws(()=>act(a,'chat',{text:'Ещё'}));act(room.host,'chat',{text:'Привет всем'});
  assert.equal(view(room,a).chat[1].author,'host');
  for(let i=0;i<105;i++)sendChat(room,b,'Сообщение '+i,Date.now()+i*1001);
  assert.equal(room.chat.length,100);assert.equal(room.chat[0].text,'Сообщение 5');
  assert.equal(new Set(room.chat.map(m=>m.id)).size,100);
  const other=createRoom('OTHER2','Другой');assert.deepEqual(view(other,other.host).chat,[]);
});

test('pause freezes remaining time and only running media; resume excludes all paused wall-clock time',()=>{
  const {room}=setup();room.deadline=8000;
  room.playback={'/a':{position:2,playing:true,updated:0},'/b':{position:7,playing:false,updated:0}};
  pauseRoom(room,1000);assert.equal(room.deadline,null);assert.equal(room.pause.remainingMs,7000);assert.equal(room.playback['/a'].position,3);assert.equal(room.playback['/a'].playing,false);
  assert.equal(tick(room),false);
  resumeRoom(room,100000);assert.equal(room.deadline,107000);assert.equal(room.playback['/a'].position,3);assert.equal(room.playback['/a'].updated,100000);assert.equal(room.playback['/a'].playing,true);assert.equal(room.playback['/b'].playing,false);
  assert.equal(room.pause,undefined);
});

test('only host may pause or resume; paused gameplay is blocked but chat and metadata work',()=>{
  const {room,a,b,act}=setup();question(room).media=[{type:'audio',url:'/a'}];room.playback={'/a':{position:1,updated:Date.now(),playing:true}};
  for(const p of [a,b])assert.throws(()=>act(p,'pause'));
  act(room.host,'pause');assert.equal(view(room,a).paused,true);const frozen=JSON.stringify(room);
  for(const [user,name,extra]of [[a,'buzz'],[b,'pass'],[room.host,'reveal'],[room.host,'judge',{correct:true}],[room.host,'media',{url:'/a',position:2,playing:true}],[room.host,'pause'],[a,'resume']]){
    assert.throws(()=>act(user,name,extra));assert.equal(JSON.stringify(room),frozen);
  }
  act(room.host,'media_metadata',{url:'/a',duration:60});assert.equal(room.playback['/a'].playing,false);
  act(a,'chat',{text:'Скоро вернусь'});assert.equal(room.chat.length,1);assert.equal(room.status,'buzzing');
  act(room.host,'resume');assert.equal(view(room,a).paused,false);assert.throws(()=>act(room.host,'resume'));
  act(a,'buzz');act(room.host,'pause');assert.equal(room.buzz,a.id);act(room.host,'resume');assert.equal(room.status,'answering');assert.equal(room.buzz,a.id);
});

test('paused state and chat survive save/restore and final submissions remain frozen',()=>{
  const {room,a,b,act}=setup();room.status='final_answer';room.final={removed:[],turn:0,order:[a.id,b.id],theme:0,entries:Object.fromEntries([a,b].map(p=>[p.id,{balance:100,bet:50,answer:null,correct:null}]))};room.deadline=Date.now()+60000;
  act(room.host,'pause');act(a,'chat',{text:'Перерыв'});
  assert.throws(()=>act(a,'final_answer',{answer:'Шесть'}));assert.equal(room.final.entries[a.id].answer,null);
  const restored=JSON.parse(JSON.stringify(room));assert.equal(tick(restored),false);assert.equal(view(restored,restored.players[0]).paused,true);assert.equal(view(restored,restored.players[1]).chat[0].text,'Перерыв');
  action(restored,restored.host,{action:'resume'});assert.ok(restored.deadline>Date.now()+59000);
  action(restored,restored.players[0],{action:'final_answer',answer:'Шесть'});assert.equal(restored.final.entries[a.id].answer,'Шесть');
});

test('lobby and finished game cannot be paused; untimed stages resume without introducing a timer',()=>{
  const room=createRoom('ABC234','Ведущий');assert.throws(()=>action(room,room.host,{action:'pause'}));
  room.status='board';action(room,room.host,{action:'pause'});action(room,room.host,{action:'resume'});assert.equal(room.deadline,null);
  room.status='finished';assert.throws(()=>action(room,room.host,{action:'pause'}));
});
