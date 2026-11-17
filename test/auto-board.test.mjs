import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,addPlayer,action,view,tick} from '../lib/game.mjs';
import {pauseRoom,resumeRoom} from '../lib/room-tools.mjs';
const setup=()=>{const room=createRoom('ABC234','Ведущий'),a=addPlayer(room,'Аня'),b=addPlayer(room,'Борис');const act=(u,name,extra={})=>action(room,u,{action:name,...extra});act(room.host,'start');act(room.host,'select',{id:'0-0-0'});return{room,a,b,act};};
test('correct answer reveals for five seconds then returns to board exactly once, preserving scores and chooser',()=>{
  const {room,a,act}=setup();act(a,'buzz');const start=Date.now();act(room.host,'judge',{correct:true});
  assert.equal(room.status,'revealed');assert.equal(room.autoBoard,true);assert.ok(room.deadline>=start+5000&&room.deadline<=Date.now()+5000);assert.equal(view(room,a).current.answer,'Шесть');
  assert.equal(tick(room),false);room.deadline=Date.now()-1;assert.equal(tick(room),true);assert.equal(room.status,'board');assert.equal(room.current,null);assert.equal(room.deadline,null);assert.equal(room.autoBoard,false);assert.equal(a.score,100);assert.equal(room.chooser,a.id);assert.equal(tick(room),false);
});
test('manual reveal and wrong answers do not start the correct-answer countdown',()=>{
  const {room,a,b,act}=setup();act(a,'buzz');act(room.host,'judge',{correct:false});act(b,'buzz');act(room.host,'judge',{correct:false});
  assert.equal(room.status,'revealed');assert.equal(room.autoBoard,false);assert.equal(room.deadline,null);assert.equal(tick(room),false);
  act(room.host,'board');act(room.host,'select',{id:'0-0-1'});act(room.host,'reveal');assert.equal(room.autoBoard,false);assert.equal(room.deadline,null);
});
test('all passes retain the question, visible pass identities and answer media until the host returns to board',()=>{
  const {room,a,b,act}=setup();room.pack.rounds[0].themes[0].questions[0].answerMedia=[{type:'audio',url:'/answer.wav'}];
  act(a,'pass');assert.equal(view(room,b).current.answer,undefined);act(b,'pass');
  const state=view(room,a);assert.equal(state.status,'revealed');assert.equal(state.current.answer,'Шесть');assert.deepEqual(state.passed,[a.id,b.id]);assert.equal(state.playback['/answer.wav'].playing,true);assert.equal(state.autoBoard,false);assert.deepEqual(room.players.map(p=>p.score),[0,0]);
});
test('automatic transition countdown survives pause and disk recovery without counting paused time',()=>{
  const {room,a,act}=setup();act(a,'buzz');act(room.host,'judge',{correct:true});const now=Date.now();
  pauseRoom(room,now);const restored=JSON.parse(JSON.stringify(room));assert.equal(tick(restored),false);assert.equal(restored.autoBoard,true);
  resumeRoom(restored,now+600000);assert.ok(restored.deadline>now+604900);assert.equal(restored.status,'revealed');
  restored.deadline=Date.now()-1;assert.equal(tick(restored),true);assert.equal(restored.status,'board');assert.equal(restored.players[0].score,100);
});
