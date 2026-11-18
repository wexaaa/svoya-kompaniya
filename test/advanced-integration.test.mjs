import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import {WebSocket} from 'ws';
import {zipSync,strToU8} from 'fflate';

test('HTTP/WebSocket: staged asset installation, shared preload progress, sealed all-play answers and recovery',async()=>{
  const dir=fs.mkdtempSync(path.resolve('test','.runtime-advanced-')),port=4400+Math.floor(Math.random()*600),base=`http://127.0.0.1:${port}`;
  const launch=()=>spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
  let child=launch();const sockets=[];
  const ready=async()=>{for(let i=0;i<60;i++){try{if((await fetch(base+'/api/info')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('Server failed to start');};
  const call=async(url,body,token)=>{const r=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,data.error);return data;};
  try{
    await ready();for(const file of ['advanced-ui.js','preload-client.js','advanced.css'])assert.equal((await fetch(base+'/'+file)).status,200);
    const h=await call('/api/create',{name:'Ведущий'}),a=await call('/api/join',{code:h.code,name:'Аня'}),b=await call('/api/join',{code:h.code,name:'Борис'});
    const act=(s,action,extra={})=>call('/api/action',{code:h.code,action,...extra},s.token),state=s=>call('/api/state?room='+h.code,undefined,s.token);
    await call('/api/library',{code:h.code,id:'mechanics'},h.token);const demo=await state(h);assert.equal(demo.pack.count,7);assert.equal(demo.preload.assets.length,2);
    for(const asset of demo.preload.assets){const r=await fetch(base+asset.url);assert.equal(r.status,200);assert.ok(r.headers.get('content-type').startsWith(asset.type==='image'?'image/':'audio/'));}
    const xml='<package version="5"><rounds><round><themes><theme name="Числа"><questions><question price="200" type="forAll"><params><param name="question"><item>Слушайте</item><item type="audio" isRef="true">a.mp3</item><item>Сколько?</item><item type="image" isRef="true">b.png</item></param><param name="answer"><item type="image" isRef="true">c.png</item></param><param name="answerType">number</param><param name="answerDeviation">1</param></params><right><answer>42</answer></right></question></questions></theme></themes></round></rounds></package>';
    const upload=await fetch(`${base}/api/pack?room=${h.code}`,{method:'POST',headers:{Authorization:`Bearer ${h.token}`},body:zipSync({'content.xml':strToU8(xml),'Audio/a.mp3':new Uint8Array([1]),'Images/b.png':new Uint8Array([2]),'Images/c.png':new Uint8Array([3])})});assert.equal(upload.status,200);
    for(const s of [h,a,b]){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);sockets.push(ws);await once(ws,'open');const message=once(ws,'message');ws.send(JSON.stringify({type:'auth',...s}));await message;}
    let snapshot=await state(h);assert.equal(snapshot.preload.people.length,3);assert.equal(snapshot.preload.assets.length,3);assert.equal(snapshot.preload.done,false);
    const id=snapshot.preload.id;
    const packets=[];sockets[2].on('message',data=>packets.push(JSON.parse(String(data))));
    for(const s of [h,a,b])await act(s,'preload_progress',{id,loaded:3,failed:0});
    await new Promise(r=>setTimeout(r,30));assert.ok(packets.some(p=>p.type==='preload'&&p.preload.done));assert.equal((await state(a)).preload.done,true);
    await act(h,'start');await act(h,'select',{id:'0-0-0'});snapshot=await state(h);assert.equal(snapshot.status,'all_answer');assert.equal(snapshot.current.text,'Слушайте');assert.equal(snapshot.current.media.length,1);
    const first=snapshot.current.media[0].url;assert.ok(first.startsWith('/media/'));assert.deepEqual([...new Uint8Array(await (await fetch(base+first)).arrayBuffer())],[1]);
    await act(h,'next_stage',{question:'0-0-0'});snapshot=await state(a);assert.equal(snapshot.current.text,'Сколько?');assert.deepEqual([...new Uint8Array(await (await fetch(base+snapshot.current.media[0].url)).arrayBuffer())],[2]);
    await Promise.all([act(a,'submit_answer',{question:'0-0-0',value:42}),act(b,'submit_answer',{question:'0-0-0',value:44})]);snapshot=await state(h);assert.equal(snapshot.status,'all_review');const aid=snapshot.players[0].id;assert.equal(snapshot.advanced.entries[aid].value,42);assert.equal((await state(b)).advanced.entries[aid].value,undefined);
    for(const ws of sockets)ws.terminate();child.kill();await once(child,'exit');child=launch();await ready();snapshot=await state(h);assert.equal(snapshot.status,'all_review');assert.equal(snapshot.sequence.index,1);
    await act(h,'all_publish',{question:'0-0-0'});snapshot=await state(a);assert.deepEqual(snapshot.players.map(p=>p.score),[200,-200]);assert.equal(snapshot.current.answer,'42');assert.ok(snapshot.current.answerMedia[0].url.startsWith('/media/'));
    assert.deepEqual([...new Uint8Array(await (await fetch(base+snapshot.current.answerMedia[0].url)).arrayBuffer())],[3]);
  }finally{for(const ws of sockets)ws.terminate();child.kill();if(child.exitCode===null)await once(child,'exit');fs.rmSync(dir,{recursive:true,force:true});}
});
