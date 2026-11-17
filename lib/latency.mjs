import {randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';

export const PING_INTERVAL_MS=5000;
export const PING_TIMEOUT_MS=20000;

export function probeLatency(ws,now=performance.now()){
  if(ws.latencyProbe){
    if(now-ws.latencyProbe.sentAt>=PING_TIMEOUT_MS)ws.terminate();
    return;
  }
  const nonce=randomBytes(12).toString('hex');
  ws.latencyProbe={nonce,sentAt:now};
  ws.ping(nonce);
}

export function recordPong(ws,payload,now=performance.now(),timestamp=Date.now()){
  const probe=ws.latencyProbe;
  if(!probe||payload.toString()!==probe.nonce)return false;
  ws.latencyProbe=null;
  ws.latency={ms:Math.max(0,Math.round(now-probe.sentAt)),measuredAt:timestamp};
  return true;
}

// Several tabs may share one seat. Keep the freshest live measurement.
export function playerLatencies(peers,code,now=Date.now()){
  const result=new Map();
  for(const ws of peers){
    if(ws.code!==code||ws.readyState!==1||!ws.latency||now-ws.latency.measuredAt>PING_TIMEOUT_MS)continue;
    const previous=result.get(ws.userId);
    if(!previous||ws.latency.measuredAt>previous.measuredAt)result.set(ws.userId,ws.latency);
  }
  return result;
}
