import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,addPlayer,action,view,tick} from '../lib/game.mjs';
import {importSiq} from '../lib/siq.mjs';
import {zipSync,strToU8} from 'fflate';

function fixture(themes=6){
  const room=createRoom('FIN234','Ведущий');
  room.pack={name:'Финальный тест',warnings:[],rounds:[{name:'Финал',type:'final',themes:Array.from({length:themes},(_,i)=>({name:`Тема ${i}`,questions:[{id:`f-${i}`,price:100,text:'Секретный вопрос',answer:'Правильный секрет',media:[],answerMedia:[]}]}))}]};
  const a=addPlayer(room,'Аня'),b=addPlayer(room,'Борис'),c=addPlayer(room,'Вика');a.score=1000;b.score=600;c.score=-50;
  action(room,room.host,{action:'start'});return{room,a,b,c,act:(user,name,extra={})=>action(room,user,{action:name,...extra})};
}
function removeAll(f){for(let i=0;i<5;i++)f.act(f.room.host,'final_remove',{theme:i});}
function bets(f){f.act(f.a,'final_bet',{bet:1000});f.act(f.b,'final_bet',{bet:400});f.act(f.c,'final_bet',{bet:0});}
test('final: lowest score goes first, cyclic turns, only one theme survives',()=>{
  const f=fixture();assert.equal(f.room.status,'final_eliminate');assert.equal(view(f.room,f.a).final.turn,f.c.id);
  assert.throws(()=>f.act(f.a,'final_remove',{theme:0}));
  f.act(f.c,'final_remove',{theme:0});assert.equal(view(f.room,f.a).final.turn,f.b.id);
  assert.throws(()=>f.act(f.b,'final_remove',{theme:0}));
  f.act(f.b,'final_remove',{theme:1});f.act(f.a,'final_remove',{theme:2});f.act(f.c,'final_remove',{theme:3});f.act(f.b,'final_remove',{theme:4});
  assert.equal(f.room.status,'final_bet');assert.equal(f.room.final.theme,5);assert.equal(f.room.current,'f-5');
  assert.equal(view(f.room,f.room.host).current,null);assert.throws(()=>addPlayer(f.room,'Поздний'));
});
test('final: bets sealed even from host; validate against frozen score; no repeated submissions',()=>{
  const f=fixture();removeAll(f);
  for(const bet of [-1,1001,1.5,'100',null])assert.throws(()=>f.act(f.a,'final_bet',{bet}));
  f.act(f.a,'final_bet',{bet:1000});assert.throws(()=>f.act(f.a,'final_bet',{bet:0}));
  for(const user of [f.room.host,f.b]){const v=view(f.room,user);assert.equal(v.final.participants.find(p=>p.id===f.a.id).bet,undefined);assert.equal(v.current,null);}
  assert.equal(view(f.room,f.a).final.mine.bet,1000);
  assert.throws(()=>f.act(f.room.host,'score',{player:f.a.id,score:2000}));
  f.act(f.b,'final_bet',{bet:400});f.act(f.c,'final_bet',{bet:0});assert.equal(f.room.status,'final_reading');
  assert.equal(view(f.room,f.a).current.text,'Секретный вопрос');assert.equal(view(f.room,f.room.host).current.answer,undefined);
});
test('final: simultaneous written answers, private review, atomic scoring, corrections and no duplicate payout',()=>{
  const f=fixture();removeAll(f);bets(f);f.act(f.room.host,'final_open_answers');
  f.act(f.a,'final_answer',{answer:'Правильный секрет'});f.act(f.b,'final_answer',{answer:'Другой ответ'});
  assert.throws(()=>f.act(f.a,'final_answer',{answer:'Изменённый ответ'}));
  for(const user of [f.b,f.room.host])assert.equal(view(f.room,user).final.participants.find(p=>p.id===f.a.id).answer,undefined);
  assert.equal(view(f.room,f.b).final.mine.answer,'Другой ответ');
  f.act(f.c,'final_answer',{answer:'Пас'});assert.equal(f.room.status,'final_review');
  assert.equal(view(f.room,f.room.host).current.answer,'Правильный секрет');assert.equal(view(f.room,f.a).current.answer,undefined);
  assert.equal(view(f.room,f.a).final.participants.find(p=>p.id===f.b.id).answer,undefined);
  assert.throws(()=>f.act(f.a,'final_judge',{player:f.a.id,correct:true}));assert.throws(()=>f.act(f.room.host,'final_publish'));
  f.act(f.room.host,'final_judge',{player:f.a.id,correct:false});f.act(f.room.host,'final_judge',{player:f.a.id,correct:true});
  f.act(f.room.host,'final_judge',{player:f.b.id,correct:false});f.act(f.room.host,'final_judge',{player:f.c.id,correct:false});
  assert.deepEqual(f.room.players.map(p=>p.score),[1000,600,-50]);
  f.act(f.room.host,'final_publish');assert.deepEqual(f.room.players.map(p=>p.score),[2000,200,-50]);assert.equal(f.room.status,'final_results');
  assert.equal(view(f.room,f.a).final.participants.find(p=>p.id===f.b.id).answer,'Другой ответ');assert.equal(view(f.room,f.b).current.answer,'Правильный секрет');
  assert.throws(()=>f.act(f.room.host,'final_publish'));assert.deepEqual(f.room.players.map(p=>p.score),[2000,200,-50]);
  f.act(f.room.host,'finish');f.act(f.room.host,'restart');assert.equal(f.room.final,null);assert.equal(f.room.status,'lobby');
});
test('final: timeout and host close preserve sent answers and mark missing answers empty',()=>{
  for(const timeout of [true,false]){
    const f=fixture();removeAll(f);f.act(f.a,'final_bet',{bet:500});f.act(f.room.host,'final_fill_bets');
    assert.equal(f.room.final.entries[f.b.id].bet,0);f.act(f.room.host,'final_open_answers');f.act(f.a,'final_answer',{answer:'Ответ А'});
    if(timeout){f.room.deadline=Date.now()-1;assert.ok(tick(f.room));}else f.act(f.room.host,'final_close_answers');
    assert.equal(f.room.status,'final_review');assert.equal(f.room.final.entries[f.a.id].answer,'Ответ А');assert.equal(f.room.final.entries[f.b.id].answer,'');assert.equal(f.room.deadline,null);
    assert.throws(()=>f.act(f.b,'final_answer',{answer:'Поздно'}));
  }
});
test('final: save/restore keeps sealed bets, submissions and phase',()=>{
  const f=fixture();removeAll(f);f.act(f.a,'final_bet',{bet:500});
  const restored=JSON.parse(JSON.stringify(f.room));const a=restored.players.find(p=>p.id===f.a.id);
  assert.equal(view(restored,a).final.mine.bet,500);assert.equal(view(restored,restored.host).final.participants.find(p=>p.id===a.id).bet,undefined);
  action(restored,restored.host,{action:'final_fill_bets'});action(restored,restored.host,{action:'final_open_answers'});action(restored,a,{action:'final_answer',answer:'Сохранённый ответ'});
  const again=JSON.parse(JSON.stringify(restored));assert.equal(view(again,a).final.mine.answer,'Сохранённый ответ');assert.equal(again.status,'final_answer');
});
test('final: SIQ round type survives import and old saved packs work by final name',()=>{
  const xml='<package name="Тест"><rounds><round name="Последний этап" type="final"><themes><theme name="Единственная"><questions><question><scenario><atom>Вопрос</atom></scenario><right><answer>Ответ</answer></right></question></questions></theme></themes></round></rounds></package>';
  const {pack}=importSiq(zipSync({'content.xml':strToU8(xml)}));assert.equal(pack.rounds[0].type,'final');
  const f=fixture();delete f.room.pack.rounds[0].type;delete f.room.final;f.room.status='board';
  assert.equal(view(f.room,f.a).board.final,true);f.act(f.room.host,'final_start');assert.equal(f.room.status,'final_eliminate');
});
test('final: next round automatically starts elimination and preserves previous scores',()=>{
  const f=fixture(),round=f.room.pack.rounds[0];
  f.room.pack.rounds=[{name:'Обычный раунд',themes:[{name:'Разминка',questions:[{id:'warmup',price:100,text:'Вопрос',answer:'Ответ',media:[],answerMedia:[]}]}]},round];
  f.room.status='board';f.room.round=0;f.room.final=null;
  f.act(f.room.host,'nextRound');assert.equal(f.room.round,1);assert.equal(f.room.status,'final_eliminate');
  assert.deepEqual(f.room.players.map(p=>p.score),[1000,600,-50]);assert.equal(view(f.room,f.a).final.turn,f.c.id);
});
