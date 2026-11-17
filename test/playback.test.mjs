import {test} from 'node:test';import assert from 'node:assert/strict';
import {createRoom,addPlayer,action,view,tick} from '../lib/game.mjs';
const setup=()=>{
  const room=createRoom('MEDIA2','Ведущий'),a=addPlayer(room,'Аня'),b=addPlayer(room,'Борис');
  const q=room.pack.rounds[0].themes[0].questions[0];q.media=[{type:'audio',url:'/sound.wav'},{type:'video',url:'/clip.mp4'}];q.answerMedia=[{type:'video',url:'/answer.mp4'}];
  const act=(user,name,extra={})=>action(room,user,{action:name,...extra});act(room.host,'start');act(room.host,'select',{id:q.id});return{room,a,b,q,act};
};
test('question media start automatically on the server for every participant, without a host play command',()=>{
  const {room,a,b,q}=setup();for(const user of [room.host,a,b]){
    const state=view(room,user);for(const m of q.media){assert.equal(state.playback[m.url].playing,true);assert.equal(state.playback[m.url].position,0);}
    assert.equal(state.playback['/answer.mp4'],undefined);
  }
});
test('only host can pause, resume, seek or publish duration; stale question commands are rejected',()=>{
  const {room,a,b,q,act}=setup();
  for(const user of [a,b])for(const name of ['media','media_metadata'])assert.throws(()=>act(user,name,{url:'/sound.wav',question:q.id,position:5,duration:20,playing:false}));
  act(room.host,'media',{url:'/sound.wav',question:q.id,position:5,playing:false});assert.equal(view(room,a).playback['/sound.wav'].playing,false);assert.equal(view(room,b).playback['/sound.wav'].position,5);
  act(room.host,'media',{url:'/sound.wav',question:q.id,position:2,playing:true});assert.equal(view(room,a).playback['/sound.wav'].position,2);
  const before=JSON.stringify(room);assert.throws(()=>act(room.host,'media',{url:'/sound.wav',question:'old-question',position:0,playing:true}));assert.equal(JSON.stringify(room),before);
});
test('server ends media and starts the answer-button timer even if no browser sends an ended event',()=>{
  const {room,act}=setup();
  act(room.host,'media_metadata',{url:'/sound.wav',duration:3});act(room.host,'media_metadata',{url:'/clip.mp4',duration:5});
  room.playback['/sound.wav'].updated=Date.now()-4000;assert.ok(tick(room));assert.equal(room.playback['/sound.wav'].ended,true);assert.equal(room.deadline,null);
  room.playback['/clip.mp4'].updated=Date.now()-6000;assert.ok(tick(room));assert.equal(room.playback['/clip.mp4'].playing,false);assert.equal(room.playback['/clip.mp4'].position,5);assert.ok(room.deadline>Date.now());
  act(room.host,'media',{url:'/clip.mp4',position:1,playing:true});assert.equal(room.deadline,null);
});
test('revealing the answer stops question media and starts answer media',()=>{
  const {room,a,act}=setup();act(room.host,'reveal');const s=view(room,a);
  assert.equal(s.playback['/sound.wav'].playing,false);assert.equal(s.playback['/clip.mp4'].playing,false);assert.equal(s.playback['/answer.mp4'].playing,true);
});
test('final review answer-media URLs remain private until results are published',()=>{
  const {room,a,b,q,act}=setup();room.pack.rounds[0].type='final';room.status='final_answer';
  room.final={removed:[],turn:0,order:[a.id,b.id],theme:0,entries:Object.fromEntries([a,b].map(p=>[p.id,{balance:100,bet:50,answer:'test',correct:null}]))};
  act(room.host,'final_close_answers');assert.equal(view(room,a).playback['/answer.mp4'],undefined);assert.equal(view(room,room.host).playback['/answer.mp4'].playing,true);
  act(room.host,'final_judge',{player:a.id,correct:true});act(room.host,'final_judge',{player:b.id,correct:false});act(room.host,'final_publish');
  assert.equal(view(room,a).playback['/answer.mp4'].playing,true);assert.equal(view(room,a).playback['/answer.mp4'].position,0);
});
test('invalid duration and unknown media never change playback',()=>{
  const {room,act}=setup();for(const duration of [0,-1,Infinity,NaN,'20',90000]){const before=JSON.stringify(room);assert.throws(()=>act(room.host,'media_metadata',{url:'/sound.wav',duration}));assert.equal(JSON.stringify(room),before);}
  assert.throws(()=>act(room.host,'media',{url:'/answer.mp4',position:0,playing:true}));
});
