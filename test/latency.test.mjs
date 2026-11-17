import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeLatency,recordPong,playerLatencies,PING_TIMEOUT_MS} from '../lib/latency.mjs';
import {createRoom,addPlayer,view} from '../lib/game.mjs';

test('RTT is measured by server clock and only a matching pong completes the probe',()=>{
  const ws={ping(nonce){this.sent=nonce;},terminate(){this.terminated=true;}};
  probeLatency(ws,100);assert.equal(ws.latencyProbe.sentAt,100);
  assert.equal(recordPong(ws,Buffer.from('unrelated'),120,1000),false);assert.equal(ws.latency,undefined);
  assert.equal(recordPong(ws,Buffer.from(ws.sent),137.6,1000),true);assert.deepEqual(ws.latency,{ms:38,measuredAt:1000});
  assert.equal(recordPong(ws,Buffer.from(ws.sent),200,1001),false);
});
test('pending probes are not piled up and an unresponsive connection is terminated',()=>{
  const ws={count:0,ping(){this.count++;},terminate(){this.terminated=true;}};
  probeLatency(ws,0);probeLatency(ws,5000);assert.equal(ws.count,1);assert.equal(ws.terminated,undefined);
  probeLatency(ws,PING_TIMEOUT_MS);assert.equal(ws.terminated,true);
});
test('latency uses freshest live tab, expires, and never leaks across rooms',()=>{
  const a={code:'ROOM01',userId:'a',readyState:1,latency:{ms:50,measuredAt:1000}};
  const b={...a,latency:{ms:90,measuredAt:1100}};
  const closed={...a,userId:'closed',readyState:3};
  const other={...a,code:'OTHER1',userId:'other'};
  assert.equal(playerLatencies([a,b,closed,other],'ROOM01',1200).get('a').ms,90);
  assert.equal(playerLatencies([a,b,closed,other],'ROOM01',1200).size,1);
  assert.equal(playerLatencies([a],'ROOM01',1001+PING_TIMEOUT_MS).size,0);
});
test('only host sees player RTT; offline player never retains a stale displayed value',()=>{
  const room=createRoom('PING23','Ведущий'),player=addPlayer(room,'Игрок'),connected=new Set([player.id]),latencies=new Map([[player.id,{ms:42,measuredAt:1000}]]);
  assert.equal(view(room,room.host,connected,latencies).players[0].pingMs,42);
  assert.equal(view(room,player,connected,latencies).players[0].pingMs,undefined);
  assert.equal(view(room,room.host,new Set(),latencies).players[0].pingMs,null);
  assert.equal(view(room,room.host,connected).players[0].pingMs,null);
});
