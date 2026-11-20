import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,addPlayer,action,view,question} from '../lib/game.mjs';
import {portrait} from '../public/profile-ui.js';
import {answerInput} from '../public/advanced-ui.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setup(extra={}){
  const room=createRoom('REPLY2','Ведущий'),a=addPlayer(room,'Аня'),b=addPlayer(room,'Борис');
  Object.assign(room.pack.rounds[0].themes[0].questions[0],extra);
  const act=(user,name,body={})=>action(room,user,{action:name,question:room.current,...body});
  act(room.host,'start');act(room.host,'select',{id:'0-0-0'});return{room,a,b,host:room.host,act};
}
test('host can judge a spoken answer without text, number or point submission',()=>{
  for(const kind of ['text','number','point']){
    const {room,a,act,host}=setup({answerType:kind});act(a,'buzz');assert.deepEqual(room.responses,{});act(host,'judge',{correct:true});
    assert.equal(a.score,100);assert.equal(room.status,'revealed');assert.deepEqual(view(room,a).playerAnswers,{});
  }
});
test('optional text answer appears on every ordinary-round seat, stays immutable and clears with question',()=>{
  const {room,a,b,act,host}=setup({answerType:'text'});
  assert.throws(()=>act(a,'submit_answer',{value:'Рано'}));act(a,'buzz');assert.throws(()=>act(b,'submit_answer',{value:'Чужой'}));
  const before=JSON.stringify(room);assert.throws(()=>act(a,'submit_answer',{value:'   '}));assert.equal(JSON.stringify(room),before);
  act(a,'submit_answer',{value:'  тест <b>не HTML</b>  '});assert.equal(room.deadline,null);assert.throws(()=>act(a,'submit_answer',{value:'Замена'}));
  for(const user of [a,b,host])assert.equal(view(room,user).playerAnswers[a.id],'тест <b>не HTML</b>');
  const restored=JSON.parse(JSON.stringify(room));assert.equal(view(restored,restored.host).playerAnswers[a.id],'тест <b>не HTML</b>');
  act(host,'judge',{correct:true});assert.equal(view(room,b).playerAnswers[a.id],'тест <b>не HTML</b>');act(host,'board');assert.deepEqual(view(room,b).playerAnswers,{});
});
test('number overlay exposes only answer text, not correctness, and accidental cancellation clears it',()=>{
  const {room,a,b,act,host}=setup({answerType:'number',rightAnswers:['42']});act(a,'buzz');act(a,'submit_answer',{value:41});
  assert.deepEqual(view(room,b).playerAnswers,{[a.id]:'41'});assert.equal(view(room,b).responses[a.id],undefined);assert.equal(view(room,a).responses[a.id].suggested,undefined);
  act(host,'cancel_answer');assert.deepEqual(view(room,b).playerAnswers,{});act(a,'buzz');act(host,'judge',{correct:true});assert.equal(a.score,100);
});
test('all-play overlays never reveal sealed answers early, including to host',()=>{
  const {room,a,b,act,host}=setup({type:'forAll',answerType:'text'});act(a,'submit_answer',{value:'Секрет А'});
  assert.deepEqual(view(room,a).playerAnswers,{[a.id]:'Секрет А'});assert.deepEqual(view(room,b).playerAnswers,{});assert.deepEqual(view(room,host).playerAnswers,{});
  act(b,'submit_answer',{value:'Секрет Б'});assert.equal(room.status,'all_review');assert.equal(view(room,host).playerAnswers[b.id],'Секрет Б');assert.equal(view(room,a).playerAnswers[b.id],undefined);
  act(host,'all_judge',{player:a.id,correct:true});act(host,'all_judge',{player:b.id,correct:false});act(host,'all_publish');assert.equal(view(room,a).playerAnswers[b.id],'Секрет Б');
});
test('final answer overlays follow own/review/published privacy',()=>{
  const {room,a,b,act,host}=setup();act(host,'reveal');act(host,'board');
  room.pack.rounds.push({type:'final',name:'Финал',themes:[{name:'Тема',questions:[{id:'final',price:100,text:'Вопрос',answer:'Ответ',media:[],answerMedia:[]}]}]});
  act(host,'nextRound');act(a,'final_bet',{bet:0});act(b,'final_bet',{bet:0});act(host,'final_open_answers');act(a,'final_answer',{answer:'Секрет А'});
  assert.deepEqual(view(room,host).playerAnswers,{});assert.deepEqual(view(room,b).playerAnswers,{});assert.equal(view(room,a).playerAnswers[a.id],'Секрет А');
  act(b,'final_answer',{answer:'Секрет Б'});assert.equal(view(room,host).playerAnswers[b.id],'Секрет Б');assert.equal(view(room,a).playerAnswers[b.id],undefined);
  act(host,'final_judge',{player:a.id,correct:true});act(host,'final_judge',{player:b.id,correct:false});act(host,'final_publish');assert.equal(view(room,a).playerAnswers[b.id],'Секрет Б');
});
test('normal optional input has no required constraint; sealed inputs still require submission',()=>{
  const s={code:'ABC234',current:{id:'q',answerType:'number'},me:'a',responses:{},advanced:{entries:{}}};
  const regular=answerInput(s,{esc});assert.ok(regular.includes('необязательно'));assert.ok(!/\brequired\b/.test(regular));assert.ok(regular.includes('голосом'));
  const all=answerInput(s,{esc,context:'all'});assert.ok(/\brequired\b/.test(all));
  s.responses.a={text:'42'};assert.equal(answerInput(s,{esc}),'');
});
test('avatar answer renders escaped text over portrait without changing seat identity',()=>{
  const html=portrait({id:'a',name:'Аня',avatarUrl:'/avatars/'+'a'.repeat(32)+'.png'},1,esc,'<img src=x onerror=alert(1)>');
  assert.ok(html.includes('has-player-answer'));assert.ok(html.includes('player-answer-overlay'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('data-camera-slot="a"'));
});
test('player card can move its camera link into the compact actions menu',()=>{
  const user={id:'a',name:'Аня',cameraUrl:'https://vdo.ninja/?view=anya'};
  assert.ok(portrait(user,1,esc).includes('Открыть видео'));
  const cardPortrait=portrait(user,1,esc,'',false);
  assert.ok(cardPortrait.includes('with-camera'));assert.ok(!cardPortrait.includes('Открыть видео'));
});
