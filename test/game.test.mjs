import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, addPlayer, action, view, tick } from '../lib/game.mjs';
import { importSiq } from '../lib/siq.mjs';
import { zipSync, strToU8 } from 'fflate';

function setup(){const room=createRoom('ABC234','Ведущий'),a=addPlayer(room,'Аня'),b=addPlayer(room,'Борис');action(room,room.host,{action:'start'});action(room,room.host,{action:'select',id:'0-0-0'});return{room,a,b};}
test('answers and session tokens stay hidden from players until reveal',()=>{
  const {room,a}=setup();const player=view(room,a),host=view(room,room.host);
  assert.equal(player.current.answer,undefined);assert.equal(host.current.answer,'Шесть');
  assert.ok(!JSON.stringify(player).includes(room.host.token));assert.ok(!JSON.stringify(player).includes(a.token));
  assert.equal(player.board.themes[0].questions[1].text,undefined);
  action(room,room.host,{action:'reveal'});assert.equal(view(room,a).current.answer,'Шесть');
});
test('first buzz wins; wrong answer costs points and locks another attempt',()=>{
  const {room,a,b}=setup();action(room,room.host,{action:'arm'});action(room,a,{action:'buzz'});
  assert.throws(()=>action(room,b,{action:'buzz'}));assert.equal(room.buzz,a.id);
  action(room,room.host,{action:'judge',correct:false});assert.equal(a.score,-100);assert.equal(room.status,'buzzing');
  assert.throws(()=>action(room,a,{action:'buzz'}));action(room,b,{action:'buzz'});action(room,room.host,{action:'judge',correct:true});
  assert.equal(b.score,100);assert.equal(room.chooser,b.id);assert.equal(room.status,'revealed');
  action(room,room.host,{action:'board'});assert.throws(()=>action(room,a,{action:'select',id:'0-0-1'}));action(room,b,{action:'select',id:'0-0-1'});
});
test('host permissions, timer expiry, no duplicate scoring, restart',()=>{
  const {room,a}=setup();assert.throws(()=>action(room,a,{action:'reveal'}));
  action(room,room.host,{action:'arm'});room.deadline=Date.now()-1;assert.ok(tick(room));assert.equal(room.status,'revealed');
  assert.throws(()=>action(room,room.host,{action:'judge',correct:true}));
  action(room,room.host,{action:'finish'});action(room,room.host,{action:'restart'});assert.equal(room.used.length,0);assert.equal(a.score,0);assert.equal(room.status,'lobby');
});
test('host adds and deducts points relative to latest score; invalid changes are atomic',()=>{
  const {room,a}=setup();
  action(room,room.host,{action:'adjust_score',player:a.id,delta:500});assert.equal(a.score,500);
  action(room,room.host,{action:'arm'});action(room,a,{action:'buzz'});action(room,room.host,{action:'judge',correct:true});
  action(room,room.host,{action:'adjust_score',player:a.id,delta:-200});assert.equal(a.score,400);
  assert.throws(()=>action(room,a,{action:'adjust_score',player:a.id,delta:1000}));
  for(const delta of [0,1.5,NaN,Infinity,'100',null,10000000,-10000001]){
    const before=JSON.stringify(room);assert.throws(()=>action(room,room.host,{action:'adjust_score',player:a.id,delta}));assert.equal(JSON.stringify(room),before);
  }
  assert.ok(room.log[0].text.includes('снимает 200'));assert.equal(view(room,a).players.find(p=>p.id===a.id).score,400);
});
test('host transfers first/next question selection; old selector immediately loses that permission',()=>{
  const room=createRoom('TURN23','Ведущий'),a=addPlayer(room,'Аня'),b=addPlayer(room,'Борис');
  action(room,room.host,{action:'give_turn',player:b.id});action(room,room.host,{action:'start'});assert.equal(room.chooser,b.id);
  assert.throws(()=>action(room,a,{action:'select',id:'0-0-0'}));action(room,b,{action:'select',id:'0-0-0'});
  assert.throws(()=>action(room,room.host,{action:'give_turn',player:a.id}));
  action(room,room.host,{action:'reveal'});action(room,room.host,{action:'give_turn',player:a.id});action(room,room.host,{action:'board'});
  assert.equal(view(room,b).chooser,a.id);assert.throws(()=>action(room,b,{action:'select',id:'0-0-1'}));action(room,a,{action:'select',id:'0-0-1'});
  assert.throws(()=>action(room,a,{action:'give_turn',player:a.id}));
});
test('host commands validate target and respect the final turn order and fixed stakes',()=>{
  const {room,a}=setup();action(room,room.host,{action:'reveal'});action(room,room.host,{action:'board'});
  assert.throws(()=>action(room,room.host,{action:'give_turn',player:'missing'}));
  assert.throws(()=>action(room,room.host,{action:'adjust_score',player:'missing',delta:100}));
  room.pack.rounds[0].type='final';assert.throws(()=>action(room,room.host,{action:'give_turn',player:a.id}));
  room.final={};room.status='final_bet';assert.throws(()=>action(room,room.host,{action:'adjust_score',player:a.id,delta:100}));
});
test('SIQ 5 imports True references, URI filenames, options and hidden answer media',()=>{
  const xml=`<package name="Тест" version="5" xmlns="urn:siq"><rounds><round name="1"><themes><theme name="Тема"><questions><question price="200"><params><param name="question" type="content"><item>Кто?</item><item type="image" isRef="True">тест 1.png</item></param><param name="answerOptions" type="group"><param name="A" type="content"><item>Алиса</item></param><param name="B" type="content"><item>Боб</item></param></param><param name="answer" type="content"><item type="video" isRef="true">ok.mp4</item></param></params><right><answer>B</answer></right></question></questions></theme></themes></round></rounds></package>`;
  const {pack,assets}=importSiq(zipSync({'content.xml':strToU8(xml),'Images/%D1%82%D0%B5%D1%81%D1%82%201.png':new Uint8Array([1,2]),'Video/ok.mp4':new Uint8Array([1])}));
  const q=pack.rounds[0].themes[0].questions[0];assert.equal(assets.length,2);assert.equal(q.media.length,1);assert.equal(q.answerMedia.length,1);assert.equal(q.answer,'B: Боб');assert.equal(q.options.length,2);
});
test('SIQ 4 marker separates question and answer, external media stays a link',()=>{
  const xml='<package name="Старый" version="4"><rounds><round><themes><theme><questions><question price="100"><scenario><atom>Вопрос</atom><atom type="marker"/><atom>Подсказка ответа</atom><atom type="image">https://example.org/image.png</atom></scenario><right><answer>Ответ</answer></right></question></questions></theme></themes></round></rounds></package>';
  const {pack}=importSiq(zipSync({'content.xml':strToU8(xml)}));const q=pack.rounds[0].themes[0].questions[0];assert.equal(q.text,'Вопрос');assert.equal(q.media.length,0);assert.equal(q.answerMedia.length,1);assert.equal(q.answer,'Ответ');
});
test('invalid and entity-bearing SIQ XML is rejected',()=>{
  for(const xml of ['<package>','<!DOCTYPE test [<!ENTITY e "abc">]><package/>'])assert.throws(()=>importSiq(zipSync({'content.xml':strToU8(xml)})));
});
