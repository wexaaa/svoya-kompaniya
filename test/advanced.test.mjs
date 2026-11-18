import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {createRoom,addPlayer,action,view,tick,question} from '../lib/game.mjs';
import {importSiq} from '../lib/siq.mjs';
import {preloadManifest,reportPreload,preloadView} from '../lib/preload.mjs';
import {validateResponse,suggestedVerdict} from '../lib/answers.mjs';

function setup(q={},mode='classic',count=2){
  const room=createRoom('NEW234','Ведущий');
  room.pack={name:'Тест',warnings:[],rounds:[{name:'Раунд',themes:[{name:'Категория',questions:[{id:'q',price:100,type:'simple',text:'Вопрос',media:[],answer:'Ответ',answerMedia:[],...q}]}]}]};
  const players=Array.from({length:count},(_,i)=>addPlayer(room,`Игрок ${i}`));players.forEach(p=>p.score=1000);
  const act=(user,name,extra={})=>action(room,user,{action:name,question:room.current,...extra});
  act(room.host,'settings',{mode});act(room.host,'start');if(room.status==='board')act(room.host,'select',{id:'q'});
  return {room,players,a:players[0],b:players[1],act,host:room.host};
}
test('auction is turn based, hides question, enforces own score, persists and awards only final stake',()=>{
  const f=setup({type:'stake'}),{room,a,b,act,host}=f;
  assert.equal(room.status,'auction');assert.equal(view(room,a).current.text,'');assert.equal(view(room,host).current.answer,undefined);
  assert.throws(()=>act(b,'auction_bid',{bet:200}));assert.throws(()=>act(a,'auction_bid',{bet:1001}));assert.throws(()=>act(a,'auction_bid',{bet:99}));
  act(a,'auction_bid',{bet:300});act(b,'auction_bid',{bet:500});act(a,'auction_pass');assert.equal(room.status,'buzzing');
  assert.equal(view(room,a).current.price,500);assert.throws(()=>act(a,'buzz'));act(b,'buzz');act(host,'judge',{correct:true});assert.equal(b.score,1500);
  const restored=JSON.parse(JSON.stringify(room));assert.equal(view(restored,restored.players[0]).current.price,500);
});
test('all passing on auction reveals without scoring; low score permits nominal bid only',()=>{
  const {room,a,b,act,host}=setup({type:'auction'});a.score=-200;
  assert.throws(()=>act(a,'auction_bid',{bet:101}));act(host,'auction_pass',{player:a.id});act(b,'auction_pass');assert.equal(room.status,'revealed');assert.deepEqual(room.players.map(p=>p.score),[-200,1000]);
});
test('secret validates recipient, price steps and privacy then restricts answering to recipient',()=>{
  const {room,a,b,act,host}=setup({type:'secret',special:{theme:'Секретная тема',min:200,max:600,step:200,selectionMode:'exceptCurrent'}});
  assert.throws(()=>act(b,'secret_player',{player:b.id}));assert.throws(()=>act(a,'secret_player',{player:a.id}));act(a,'secret_player',{player:b.id});
  assert.equal(view(room,host).current.answer,undefined);assert.throws(()=>act(a,'secret_price',{price:400}));assert.throws(()=>act(b,'secret_price',{price:300}));act(b,'secret_price',{price:400});
  assert.equal(room.status,'buzzing');assert.throws(()=>act(a,'buzz'));act(b,'buzz');act(host,'judge',{correct:false});assert.equal(b.score,600);assert.equal(room.status,'revealed');
});
test('secretNoQuestion pays once and noRisk has no penalty when minus is enabled',()=>{
  const f=setup({type:'secretNoQuestion',special:{min:300,max:300,step:0,selectionMode:'current'}});
  f.act(f.a,'secret_player',{player:f.a.id});f.act(f.a,'secret_price',{price:300});assert.equal(f.a.score,1300);assert.equal(f.room.status,'revealed');assert.throws(()=>f.act(f.a,'secret_price',{price:300}));
  const g=setup({type:'noRisk'});assert.throws(()=>g.act(g.b,'buzz'));g.act(g.a,'buzz');g.act(g.host,'judge',{correct:false});assert.equal(g.a.score,1000);assert.equal(g.room.status,'revealed');
});
test('number answers require buzz, remain private and immutable; host keeps scoring control',()=>{
  const {room,a,b,act,host}=setup({answerType:'number',rightAnswers:['100'],answerDeviation:5});
  assert.throws(()=>act(a,'submit_answer',{value:100}));act(a,'buzz');assert.throws(()=>act(a,'submit_answer',{value:'100'}));act(a,'submit_answer',{value:104.9});
  assert.equal(room.deadline,null);assert.equal(view(room,b).responses[a.id],undefined);assert.equal(view(room,a).responses[a.id].suggested,undefined);assert.equal(view(room,host).responses[a.id].suggested,true);
  assert.throws(()=>act(a,'submit_answer',{value:0}));assert.throws(()=>act(b,'submit_answer',{value:100}));assert.equal(a.score,1000);
  act(host,'cancel_answer');assert.deepEqual(room.responses,{});act(a,'buzz');act(a,'submit_answer',{value:111});assert.equal(view(room,host).responses[a.id].suggested,false);act(host,'judge',{correct:true,multiplier:.5});assert.equal(a.score,1050);
});
test('point answers use normalized image coordinates and package aspect ratio for tolerance',()=>{
  const q={answerType:'point',rightAnswers:['0.5,0.5,2'],answerDeviation:.1};
  assert.equal(suggestedVerdict(q,{x:.54,y:.5}),true);assert.equal(suggestedVerdict(q,{x:.56,y:.5}),false);
  for(const v of [{x:-.1,y:0},{x:1,y:2},{x:'0',y:0},null])assert.throws(()=>validateResponse(q,v));
  const {room,a,act,host}=setup(q);act(a,'buzz');act(a,'submit_answer',{value:{x:.5,y:.5,extra:'ignored'}});assert.deepEqual(room.responses[a.id].value,{x:.5,y:.5});
  assert.equal(view(room,a).current.rightPoints,undefined);assert.deepEqual(view(room,host).current.rightPoints,[{x:.5,y:.5}]);
});
test('simultaneous answers are hidden even from host until collection closes; publication is atomic',()=>{
  const {room,a,b,act,host}=setup({type:'forAll'});assert.equal(room.status,'all_answer');assert.throws(()=>act(a,'buzz'));
  act(a,'submit_answer',{value:'Секрет А'});
  for(const user of [b,host]){const v=view(room,user);assert.equal(v.advanced.entries[a.id].value,undefined);assert.equal(v.current.answer,undefined);}
  assert.throws(()=>act(a,'submit_answer',{value:'Замена'}));act(b,'submit_answer',{value:'Секрет Б'});assert.equal(room.status,'all_review');
  assert.equal(view(room,host).advanced.entries[a.id].text,'Секрет А');assert.equal(view(room,a).advanced.entries[b.id].value,undefined);assert.equal(view(room,a).current.answer,undefined);
  act(host,'all_judge',{player:a.id,correct:true});act(host,'all_judge',{player:b.id,correct:false});assert.deepEqual(room.players.map(p=>p.score),[1000,1000]);act(host,'all_publish');assert.deepEqual(room.players.map(p=>p.score),[1100,900]);assert.equal(room.status,'revealed');assert.throws(()=>act(host,'all_publish'));assert.equal(view(room,a).advanced.entries[b.id].text,'Секрет Б');
});
test('all-mode typed answers are suggested automatically; pass and timeout cost zero',()=>{
  const f=setup({answerType:'number',rightAnswers:['42'],answerDeviation:1},'all');f.act(f.a,'submit_answer',{value:42});f.act(f.b,'all_pass');assert.equal(f.room.status,'all_review');f.act(f.host,'all_publish');assert.deepEqual(f.room.players.map(p=>p.score),[1100,1000]);
  const g=setup({type:'forAll'});g.act(g.a,'submit_answer',{value:'Ответ'});g.room.deadline=Date.now()-1;tick(g.room);assert.equal(g.room.status,'all_review');g.act(g.host,'all_judge',{player:g.a.id,correct:true});g.act(g.host,'all_publish');assert.equal(g.b.score,1000);
});
test('all-mode respects snapshot participants, pause, late and stale submissions',()=>{
  const f=setup({type:'forAll'}),late=addPlayer(f.room,'Опоздал');assert.throws(()=>f.act(late,'submit_answer',{value:'x'}));
  f.act(f.host,'pause');assert.throws(()=>f.act(f.a,'submit_answer',{value:'x'}));const restored=JSON.parse(JSON.stringify(f.room));assert.equal(restored.pause.remainingMs>0,true);f.act(f.host,'resume');
  assert.throws(()=>f.act(f.a,'submit_answer',{question:'old',value:'x'}));f.room.deadline=Date.now()-1;assert.throws(()=>f.act(f.a,'submit_answer',{value:'x'}));tick(f.room);assert.throws(()=>f.act(f.a,'submit_answer',{value:'x'}));
});
test('stakeAll seals bets from host and uses each individual stake for simultaneous answers',()=>{
  const {room,a,b,act,host}=setup({type:'stakeAll',answerType:'number',rightAnswers:['7']});
  act(a,'all_bet',{bet:600});assert.equal(view(room,host).advanced.bets.find(p=>p.id===a.id).value,undefined);assert.equal(view(room,b).current.text,'');assert.throws(()=>act(a,'all_bet',{bet:0}));act(b,'all_bet',{bet:200});
  act(a,'submit_answer',{value:7});act(b,'submit_answer',{value:8});act(host,'all_publish');assert.deepEqual(room.players.map(p=>p.score),[1600,800]);
});
test('quiz automatically moves sequentially, and preserves special question mechanics',()=>{
  const {room,a,b,act,host}=setup({answerType:'number',rightAnswers:['7']},'all');room.pack.rounds[0].themes[0].questions.push({id:'next',type:'noRisk',price:200,text:'Дальше',media:[],answer:'x',answerMedia:[]});
  act(a,'submit_answer',{value:7});act(b,'submit_answer',{value:7});act(host,'all_publish');room.deadline=Date.now()-1;tick(room);assert.equal(room.current,'next');assert.equal(room.status,'buzzing');assert.equal(room.advanced.noRisk,true);
});
test('content stages reveal only current question media and advance on end, duration or host action',()=>{
  const {room,a,act,host}=setup({stages:[{text:'Слушайте',media:[{type:'audio',url:'/a'}],waitForFinish:true},{text:'Теперь картинка',media:[{type:'image',url:'/b'}],duration:2},{text:'Кто это?',media:[]}],media:[{type:'audio',url:'/a'},{type:'image',url:'/b'}]});
  assert.equal(view(room,a).current.text,'Слушайте');assert.equal(view(room,a).current.media.length,1);assert.equal(room.deadline,null);
  act(host,'media',{url:'/a',playing:false,position:3,ended:true});tick(room);assert.equal(view(room,a).current.text,'Теперь картинка');assert.equal(room.sequence.index,1);assert.equal(room.playback['/a'].playing,false);
  act(host,'pause');assert.ok(room.pause.sequenceMs>0);assert.equal(room.sequence.until,null);act(host,'resume');room.sequence.until=Date.now()-1;tick(room);assert.equal(room.sequence.index,2);assert.ok(room.deadline>Date.now());
  assert.throws(()=>act(a,'next_stage'));assert.throws(()=>act(host,'next_stage'));
});
test('final content stage duration holds button timer and manual next cannot reveal answer',()=>{
  const {room,a,act,host}=setup({stages:[{text:'Ждите',media:[],duration:5}]});assert.equal(room.deadline,null);assert.throws(()=>act(host,'next_stage'));act(a,'buzz');act(host,'cancel_answer');assert.equal(room.deadline,null);room.sequence.until=Date.now()-1;tick(room);assert.ok(room.deadline>Date.now());
});
test('preload progress counts connected players and host, hides only when all complete and resets for new manifest',()=>{
  const {room,a,b}=setup({media:[{type:'image',url:'/image',bytes:50}],stages:[{text:'',media:[{type:'image',url:'/image',bytes:50}]}],answerMedia:[{type:'video',url:'/answer',bytes:100}]});
  const manifest=preloadManifest(room);assert.equal(manifest.assets.length,2);const online=new Set(['host',a.id,b.id]);
  reportPreload(room,a,{id:manifest.id,loaded:2,failed:0});assert.equal(preloadView(room,online).done,false);reportPreload(room,room.host,{id:manifest.id,loaded:2,failed:0});reportPreload(room,b,{id:manifest.id,loaded:1,failed:1});assert.equal(preloadView(room,online).done,false);
  reportPreload(room,b,{id:manifest.id,loaded:2,failed:0});assert.equal(preloadView(room,online).done,true);assert.equal(preloadView(room,new Set(['host',a.id])).people.length,2);
  assert.throws(()=>reportPreload(room,a,{id:'old',loaded:2,failed:0}));assert.throws(()=>reportPreload(room,a,{id:manifest.id,loaded:2,failed:1}));
  room.pack={...room.pack,rounds:[{themes:[{questions:[{media:[{type:'image',url:'/other'}]}]}]}]};assert.notEqual(preloadManifest(room).id,manifest.id);assert.equal(preloadView(room,online).people[0].loaded,0);
});
test('SIQ imports old and modern special parameters, staged timing, raw numeric and point answers',()=>{
  const questions=`<question price="200" type="secretPublicPrice"><params><param name="price" type="numberSet"><numberSet minimum="100" maximum="500" step="100"/></param><param name="selectionMode">any</param><param name="theme">Секрет</param><param name="question"><item>Текст</item><item type="audio" isRef="true" duration="00:00:02">a.mp3</item><item type="image" isRef="true">b.png</item></param><param name="answerType">point</param><param name="answerDeviation">0.1</param></params><right><answer>0.5,0.5,1.78</answer></right></question><question price="300"><type name="bagcat"><param name="cost">200;600;200</param><param name="self">true</param></type><scenario><atom time="3">Первый</atom><atom>Второй</atom></scenario><right><answer>42</answer></right></question>`;
  const xml=`<package><rounds><round><themes><theme><questions>${questions}</questions></theme></themes></round></rounds></package>`;
  const {pack}=importSiq(zipSync({'content.xml':strToU8(xml),'Audio/a.mp3':new Uint8Array([1]),'Images/b.png':new Uint8Array([2])}));const [q,old]=pack.rounds[0].themes[0].questions;
  assert.equal(q.type,'secretPublicPrice');assert.deepEqual(q.special,{theme:'Секрет',selectionMode:'any',min:100,max:500,step:100});assert.equal(q.stages.length,2);assert.equal(q.stages[0].duration,2);assert.equal(q.stages[1].media[0].type,'image');assert.equal(q.answerType,'point');assert.deepEqual(q.rightAnswers,['0.5,0.5,1.78']);assert.equal(q.answerDeviation,.1);
  assert.equal(old.type,'bagcat');assert.equal(old.special.min,200);assert.equal(old.special.max,600);assert.equal(old.special.step,200);assert.equal(old.special.selectionMode,'any');assert.equal(old.stages[0].duration,3);assert.equal(old.stages.length,2);assert.deepEqual(pack.warnings,[]);
});
test('numeric final submits structured value and keeps it sealed until host review',()=>{
  const {room,a,b,act,host}=setup();act(host,'reveal');act(host,'board');room.pack.rounds.push({type:'final',name:'Финал',themes:[{name:'Число',questions:[{id:'final',answerType:'number',rightAnswers:['10'],answerDeviation:1,text:'Сколько?',price:100,media:[],answer:'10',answerMedia:[]}]}]});act(host,'nextRound');act(a,'final_bet',{bet:100});act(b,'final_bet',{bet:50});act(host,'final_open_answers');
  assert.throws(()=>act(a,'final_answer',{answer:'10'}));act(a,'final_answer',{value:10.5});assert.equal(view(room,host).final.participants[0].value,undefined);act(b,'final_answer',{value:50});assert.equal(room.status,'final_review');const entries=view(room,host).final.participants;assert.equal(entries.find(p=>p.id===a.id).suggested,true);assert.equal(entries.find(p=>p.id===b.id).suggested,false);
});
