import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,addPlayer,action,view} from '../lib/game.mjs';
import {cropRect} from '../public/profile-ui.js';
const setup=()=>{const room=createRoom('QUICK2','Ведущий'),a=addPlayer(room,'Аня'),b=addPlayer(room,'Борис');action(room,room.host,{action:'start'});action(room,room.host,{action:'select',id:'0-0-0'});return{room,a,b,act:(user,act,extra={})=>action(room,user,{action:act,...extra})};};

test('answer is available immediately and old arm messages never extend the timer',()=>{
  const {room,a,act}=setup();assert.equal(room.status,'buzzing');assert.ok(room.deadline>Date.now());
  const deadline=room.deadline;act(room.host,'arm');assert.equal(room.deadline,deadline);
  act(a,'buzz');assert.equal(room.status,'answering');assert.equal(room.buzz,a.id);
});
test('passes are personal and reveal the answer without scoring only when everyone is done',()=>{
  const {room,a,b,act}=setup();a.score=500;b.score=700;
  assert.throws(()=>act(room.host,'pass'));act(a,'pass');assert.deepEqual(view(room,b).passed,[a.id]);assert.equal(view(room,b).current.answer,undefined);
  assert.throws(()=>act(a,'pass'));assert.throws(()=>act(a,'buzz'));assert.equal(room.status,'buzzing');
  const late=addPlayer(room,'Опоздавший');assert.throws(()=>act(late,'pass'));assert.throws(()=>act(late,'buzz'));
  act(b,'pass');assert.equal(room.status,'revealed');assert.equal(room.current,'0-0-0');assert.equal(room.deadline,null);assert.deepEqual([a.score,b.score],[500,700]);assert.ok(room.used.includes('0-0-0'));
  assert.equal(view(room,b).current.answer,'Шесть');assert.deepEqual(view(room,b).passed,[a.id,b.id]);
  act(room.host,'board');act(room.host,'select',{id:'0-0-1'});assert.deepEqual(room.passed,[]);act(late,'buzz');assert.equal(room.buzz,late.id);
});
test('pass cannot interrupt an answer; a wrong answer and remaining pass exhaust the question',()=>{
  const {room,a,b,act}=setup();act(a,'buzz');assert.throws(()=>act(b,'pass'));act(room.host,'judge',{correct:false});act(b,'pass');
  assert.equal(room.status,'revealed');assert.equal(a.score,-100);assert.equal(b.score,0);
  room.status='final_bet';room.final={};assert.throws(()=>act(a,'pass'));
});
test('wrong answer respects already passed players and compatibility with saved reading phase',()=>{
  const {room,a,b,act}=setup();room.status='reading';act(a,'pass');act(b,'buzz');act(room.host,'judge',{correct:false});assert.equal(room.status,'revealed');
});
test('audio/video allow immediate answers while the button timer waits for all question media to end',()=>{
  const {room,a,act}=setup();act(room.host,'reveal');act(room.host,'board');
  const q=room.pack.rounds[0].themes[0].questions[1];q.media=[{type:'audio',url:'/one.wav'},{type:'video',url:'/two.mp4'}];
  act(room.host,'select',{id:q.id});assert.equal(room.status,'buzzing');assert.equal(room.deadline,null);
  assert.throws(()=>act(a,'media',{url:'/one.wav',position:1,ended:true}));
  act(room.host,'media',{url:'/one.wav',position:1,ended:true});assert.equal(room.deadline,null);
  act(room.host,'media',{url:'/two.mp4',position:1,ended:true});assert.ok(room.deadline>Date.now());
});
test('crop geometry covers the selected square without empty edges and clamps zoom/panning',()=>{
  assert.deepEqual(cropRect(800,400),{x:200,y:0,width:400,height:400});
  assert.deepEqual(cropRect(800,400,2,-1,1),{x:0,y:200,width:200,height:200});
  assert.deepEqual(cropRect(400,800,4,1,-1),{x:300,y:0,width:100,height:100});
  assert.deepEqual(cropRect(400,400,.1,9,-9),{x:0,y:0,width:400,height:400});
  assert.throws(()=>cropRect(0,400));
});
