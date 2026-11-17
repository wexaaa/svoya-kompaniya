import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,addPlayer,action,view,question} from '../lib/game.mjs';
const setup=()=>{const room=createRoom('ABC234','Ведущий'),a=addPlayer(room,'Аня'),b=addPlayer(room,'Борис');const act=(u,name,extra={})=>action(room,u,{action:name,...extra});act(room.host,'start');act(room.host,'select',{id:'0-0-0'});act(a,'buzz');return{room,a,b,act};};
test('host can award half, normal or double question points; every award retains the normal correct-answer flow',()=>{
  for(const multiplier of [0.5,1,2]){const {room,a,act}=setup();act(room.host,'judge',{correct:true,multiplier});assert.equal(a.score,100*multiplier);assert.equal(room.status,'revealed');assert.equal(room.autoBoard,true);assert.equal(room.chooser,a.id);assert.throws(()=>act(room.host,'judge',{correct:true,multiplier}));assert.equal(a.score,100*multiplier);}
  const {room,a,act}=setup();question(room).price=101;act(room.host,'judge',{correct:true,multiplier:0.5});assert.equal(a.score,51);
});
test('unauthorized and invalid awards leave scores, timer and answer unchanged',()=>{
  const {room,a,act}=setup();
  for(const [user,extra]of [[a,{correct:true,multiplier:2}],...[0,-1,3,'2',NaN,Infinity].map(multiplier=>[room.host,{correct:true,multiplier}]),[room.host,{correct:false,multiplier:2}]]){const before=JSON.stringify(room);assert.throws(()=>act(user,'judge',extra));assert.equal(JSON.stringify(room),before);}
});
test('zero cancels an accidental press without scoring, releases the option and lets the player try again',()=>{
  const {room,a,b,act}=setup();question(room).options=[{key:'A',text:'Вариант',media:[]}];act(a,'choose_option',{question:room.current,option:0});
  assert.throws(()=>act(b,'cancel_answer'));act(room.host,'cancel_answer');
  assert.equal(a.score,0);assert.equal(room.status,'buzzing');assert.equal(room.buzz,null);assert.deepEqual(room.attempted,[]);assert.deepEqual(room.optionSelections,{});assert.equal(view(room,a).wrongAnswer,null);assert.equal(view(room,a).current.answer,undefined);
  assert.throws(()=>act(room.host,'cancel_answer'));act(a,'buzz');act(room.host,'pause');assert.throws(()=>act(room.host,'cancel_answer'));act(room.host,'resume');act(room.host,'judge',{correct:true});assert.equal(a.score,100);
});
test('wrong answer publishes a one-second red flash even without a points penalty; expired flashes vanish',()=>{
  const {room,a,b,act}=setup();room.minus=false;const before=Date.now();act(room.host,'judge',{correct:false});
  const flash=view(room,b).wrongAnswer;assert.equal(flash.player,a.id);assert.ok(flash.until>=before+1000&&flash.until<=Date.now()+1000);assert.equal(a.score,0);assert.equal(room.status,'buzzing');
  room.wrongAnswer.until=Date.now()-1;assert.equal(view(room,a).wrongAnswer,null);
  act(b,'buzz');act(room.host,'judge',{correct:true,multiplier:2});assert.equal(view(room,a).wrongAnswer,null);assert.equal(b.score,200);
});
