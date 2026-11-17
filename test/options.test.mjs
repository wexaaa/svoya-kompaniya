import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,addPlayer,action,view,question} from '../lib/game.mjs';

function setup(){
  const room=createRoom('ABC234','Ведущий'),a=addPlayer(room,'Аня'),b=addPlayer(room,'Борис');
  action(room,room.host,{action:'start'});action(room,room.host,{action:'select',id:'0-0-0'});
  question(room).options=[{key:'A',text:'Пять',media:[]},{key:'B',text:'Шесть',media:[]}];
  const choose=(user,option,extra={})=>action(room,user,{action:'choose_option',question:room.current,option,...extra});
  return {room,a,b,choose};
}
test('only buzz winner can choose an option; host still decides points and next turn',()=>{
  const {room,a,b,choose}=setup();
  const before=JSON.stringify(room);assert.throws(()=>choose(a,1));assert.equal(JSON.stringify(room),before);
  action(room,a,{action:'buzz'});choose(a,1);
  assert.equal(room.status,'answering');assert.equal(room.buzz,a.id);assert.deepEqual(room.attempted,[a.id]);assert.equal(a.score,0);
  const snapshot=JSON.stringify(room);assert.throws(()=>choose(b,0));assert.equal(JSON.stringify(room),snapshot);
  action(room,room.host,{action:'judge',correct:true});assert.equal(a.score,100);assert.equal(room.chooser,a.id);assert.equal(room.status,'revealed');
});
test('buzz winner can choose once; a saved answer awaits host judgement without timing out',()=>{
  const {room,a,choose}=setup();action(room,a,{action:'buzz'});
  choose(a,0);assert.equal(room.deadline,null);assert.deepEqual(room.attempted,[a.id]);
  assert.throws(()=>choose(a,1));assert.equal(room.optionSelections[a.id],0);
});
test('invalid, stale, ineligible, late and final option submissions are rejected without changes',()=>{
  const {room,a,b,choose}=setup();
  for(const [user,option,extra] of [[a,-1],[a,2],[a,'1'],[a,0,{question:'old'}],[room.host,0]]){
    const before=JSON.stringify(room);assert.throws(()=>choose(user,option,extra));assert.equal(JSON.stringify(room),before);
  }
  action(room,a,{action:'pass'});assert.throws(()=>choose(a,1));
  const late=addPlayer(room,'Опоздал');assert.throws(()=>choose(late,1));
  action(room,b,{action:'buzz'});room.deadline=Date.now()-1;assert.throws(()=>choose(b,1));
  room.deadline=null;action(room,room.host,{action:'judge',correct:false});assert.throws(()=>choose(b,1));
  room.status='final_answer';room.final={};assert.throws(()=>choose(late,1));
});
test('choice is private to its player and host until reveal and survives room persistence',()=>{
  const {room,a,b,choose}=setup();action(room,a,{action:'buzz'});choose(a,0);
  assert.deepEqual(view(room,b).optionSelections,{});assert.equal(view(room,a).optionSelections[a.id],0);assert.equal(view(room,room.host).optionSelections[a.id],0);
  assert.ok(!room.log.some(e=>e.text.includes('Пять')));
  const restored=JSON.parse(JSON.stringify(room));assert.equal(view(restored,restored.host).optionSelections[a.id],0);
  action(room,room.host,{action:'judge',correct:false});action(room,b,{action:'buzz'});choose(b,1);action(room,room.host,{action:'judge',correct:true});
  assert.deepEqual(view(room,b).optionSelections,{[a.id]:0,[b.id]:1});
  action(room,room.host,{action:'board'});assert.deepEqual(room.optionSelections,{});
  action(room,room.host,{action:'select',id:'0-0-1'});assert.throws(()=>choose(a,0));assert.equal(room.status,'buzzing');
});
