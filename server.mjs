import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomInt, randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createRoom, addPlayer, authenticate, action, tick, view } from './lib/game.mjs';
import { importSiq } from './lib/siq.mjs';
import { demoPack } from './lib/demo.mjs';
import {advancedDemoPack,demoTone} from './lib/demo-advanced.mjs';
import {shareSettings} from './lib/network.mjs';
import {probeLatency,recordPong,playerLatencies,PING_INTERVAL_MS} from './lib/latency.mjs';
import {cameraLink,validateAvatar} from './lib/profile.mjs';
import {allQuestionMedia,reportPreload,preloadView} from './lib/preload.mjs';

const base = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.DATA_DIR || path.join(base, 'data'));
const port = Number(process.env.PORT || 3100);
const controlToken=randomBytes(32).toString('hex');
fs.mkdirSync(path.join(dataDir, 'media'), { recursive:true });
const rooms = new Map();
for (const name of fs.readdirSync(dataDir).filter(n => /^[A-Z2-9]{6}\.json$/.test(n))) {
  try {
    const room=JSON.parse(fs.readFileSync(path.join(dataDir,name),'utf8'));
    for(const [index,round]of room.pack.rounds.entries())if(!round.type&&index===room.pack.rounds.length-1&&/финал|final/i.test(round.name))round.type='final';
    delete room.preloadProgress;
    room.pack.warnings=room.pack.warnings.map(w=>w.replace('Аукционы, «коты», финальные ставки и другие особые механики играются как обычные вопросы.','Аукционы, «коты» и другие особые вопросы обычных раундов играются без специальных механик.'));
    rooms.set(room.code,room);
  }
  catch { console.warn('Не удалось прочитать сохранённую комнату:', name); }
}
const persist = room => {
  const dest = path.join(dataDir, `${room.code}.json`);
  fs.writeFileSync(dest + '.tmp', JSON.stringify(room));
  fs.renameSync(dest + '.tmp', dest);
};
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => { let code; do { code = Array.from({length:6}, () => alphabet[randomInt(alphabet.length)]).join(''); } while(rooms.has(code)); return code; };
const peers = new Set();
const connected = code => new Set([...peers].filter(p => p.code === code && p.readyState === WebSocket.OPEN).map(p => p.userId));
function sendState(ws, room) {
  try { ws.send(JSON.stringify({ type:'state', state:view(room, authenticate(room, ws.auth), connected(room.code),playerLatencies(peers,room.code)) })); }
  catch { ws.close(4001, 'Session expired'); }
}
function broadcast(room) { for (const ws of peers) if (ws.code === room.code && ws.readyState === WebSocket.OPEN) sendState(ws,room); }
function sendLatencies(room){
  const online=connected(room.code),measurements=playerLatencies(peers,room.code);
  const packet=JSON.stringify({type:'latency',code:room.code,players:room.players.map(p=>({id:p.id,online:online.has(p.id),pingMs:online.has(p.id)?measurements.get(p.id)?.ms??null:null}))});
  for(const ws of peers)if(ws.code===room.code&&ws.userId==='host'&&ws.readyState===WebSocket.OPEN)ws.send(packet);
}
function preloadChanged(room){
  const packet=JSON.stringify({type:'preload',code:room.code,preload:preloadView(room,connected(room.code))});
  for(const ws of peers)if(ws.code===room.code&&ws.readyState===WebSocket.OPEN)ws.send(packet);
}
function changed(room,chatOnly=false) {
  persist(room);
  if(chatOnly){
    const packet=JSON.stringify({type:'chat',code:room.code,messages:room.chat||[]});
    for(const ws of peers)if(ws.code===room.code&&ws.readyState===WebSocket.OPEN)ws.send(packet);
  }else broadcast(room);
}
function json(res, status, body) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}); res.end(JSON.stringify(body)); }
const rate = new Map();
function rateLimit(req, type, max) {
  const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress);
  const key = `${type}:${ip}`, now = Date.now();
  let entry = rate.get(key);
  if (!entry || now - entry.time > 60000) { entry={ time:now, n:0 }; rate.set(key,entry); }
  if (++entry.n > max) throw new Error('Слишком много попыток. Подождите минуту.');
}
setInterval(() => { for (const [k,v] of rate) if (Date.now()-v.time > 120000) rate.delete(k); },60000).unref();
async function read(req, max) {
  if (Number(req.headers['content-length'] || 0) > max) throw new Error(`Запрос слишком большой. Максимум ${Math.ceil(max/1024/1024)} МБ.`);
  const chunks=[]; let length=0;
  for await (const chunk of req) { length+=chunk.length; if(length>max) throw new Error('Запрос слишком большой.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
const bearer = req => String(req.headers.authorization || '').replace(/^Bearer /,'');
const getRoom = code => { const room=rooms.get(String(code || '').toUpperCase()); if(!room) throw new Error('Комната не найдена. Проверьте код.'); return room; };
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
const assetsIn = allQuestionMedia;
function installPack(room, imported) {
  const dest=path.join(dataDir,'media',room.code);fs.mkdirSync(dest,{recursive:true});
  for(const asset of imported.assets){fs.writeFileSync(path.join(dest,asset.id),asset.data);fs.writeFileSync(path.join(dest,asset.id+'.mime'),asset.mime);}
  for(const round of imported.pack.rounds)for(const theme of round.themes)for(const q of theme.questions)for(const m of assetsIn(q))if(m.asset){m.url=`/media/${room.code}/${m.asset}`;delete m.asset;}
  room.pack=imported.pack;room.round=0;room.used=[];room.revision++;changed(room);
}

const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: http: data: blob:; media-src 'self' https: http: blob:; connect-src 'self' ws: wss: https: http:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if(req.method==='POST'&&url.pathname==='/api/shutdown'){
      if(bearer(req)!==controlToken)return json(res,403,{error:'Нет доступа.'});
      json(res,200,{ok:true});setTimeout(shutdown,200);return;
    }
    // Bearer-authenticated mutations are same-origin; no permissive CORS.
    if (req.method === 'POST' && req.headers.origin) {
      if (new URL(req.headers.origin).host !== req.headers.host) return json(res,403,{error:'Недопустимый источник запроса.'});
    }
    if (req.method === 'GET' && url.pathname === '/api/info') {
      let publicUrl=process.env.PUBLIC_URL || '';
      try {publicUrl=fs.readFileSync(path.join(dataDir,'public-url.txt'),'utf8').trim();}catch{}
      const sharing=shareSettings({port,mode:process.env.SHARE_MODE||'local',publicUrl});
      const library=[{id:'mechanics',name:'Новые механики · пробный набор'},...(fs.existsSync(path.join(base,'packs'))?fs.readdirSync(path.join(base,'packs')).filter(n=>n.toLowerCase().endsWith('.siq')).map(n=>({id:n,name:n.replace(/\.siq$/i,'')})):[])];
      return json(res,200,{title:'Своя компания',version:'1.12.2',...sharing,library,maxPlayers:12});
    }
    if (req.method === 'POST' && url.pathname === '/api/create') {
      rateLimit(req,'create',10);
      if(rooms.size>=40) throw new Error('Достигнут лимит 40 комнат. Закройте сервер и удалите старые комнаты из папки data.');
      const body=JSON.parse((await read(req,4096)).toString());
      const room=createRoom(newCode(),body.name); rooms.set(room.code,room); persist(room);
      return json(res,200,{code:room.code,token:room.host.token});
    }
    if (req.method === 'POST' && url.pathname === '/api/join') {
      rateLimit(req,'join',30);
      const body=JSON.parse((await read(req,4096)).toString());
      const room=getRoom(body.code), user=addPlayer(room,body.name); changed(room);
      return json(res,200,{code:room.code,token:user.token});
    }
    if (req.method === 'POST' && url.pathname === '/api/action') {
      const body=JSON.parse((await read(req,8192)).toString()), room=getRoom(body.code), user=authenticate(room,bearer(req));
      if(body.action==='preload_progress'){reportPreload(room,user,body);preloadChanged(room);return json(res,200,{ok:true});}
      if(tick(room))changed(room); action(room,user,body); changed(room,body.action==='chat'); return json(res,200,{ok:true});
    }
    if(req.method==='POST'&&url.pathname==='/api/profile'){
      const body=JSON.parse((await read(req,8192)).toString()),room=getRoom(body.code),user=authenticate(room,bearer(req));
      const link=cameraLink(body.cameraUrl);
      user.cameraUrl=link;
      if(body.removeAvatar===true)delete user.avatarUrl;
      room.revision++;changed(room);return json(res,200,{ok:true});
    }
    if(req.method==='POST'&&url.pathname==='/api/avatar'){
      const room=getRoom(url.searchParams.get('room')),user=authenticate(room,bearer(req));
      rateLimit(req,'avatar',30);
      const buffer=await read(req,1024*1024);validateAvatar(buffer);
      // Uploads yield to other requests; do not restore a seat removed meanwhile.
      if(authenticate(room,bearer(req))!==user)throw new Error('Место участника больше недоступно.');
      const folder=path.join(dataDir,'avatars');fs.mkdirSync(folder,{recursive:true});
      const file=randomBytes(16).toString('hex')+'.png';
      fs.writeFileSync(path.join(folder,file),buffer);
      user.avatarUrl='/avatars/'+file;room.revision++;changed(room);
      return json(res,200,{ok:true,avatarUrl:user.avatarUrl});
    }
    if(req.method==='POST'&&url.pathname==='/api/rejoin-link'){
      const body=JSON.parse((await read(req,4096)).toString()),room=getRoom(body.code),user=authenticate(room,bearer(req));
      if(user.id!=='host')return json(res,403,{error:'Ссылку для возвращения выдаёт ведущий.'});
      const player=room.players.find(p=>p.id===body.player);if(!player)throw new Error('Игрок не найден.');
      return json(res,200,{token:player.token});
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const room=getRoom(url.searchParams.get('room')), user=authenticate(room,bearer(req));
      if(tick(room)) changed(room);
      return json(res,200,view(room,user,connected(room.code),playerLatencies(peers,room.code)));
    }
    if (req.method === 'POST' && url.pathname === '/api/pack') {
      const room=getRoom(url.searchParams.get('room')), user=authenticate(room,bearer(req));
      if(user.id!=='host' || room.status!=='lobby') throw new Error('Пакет меняет ведущий в лобби.');
      rateLimit(req,'upload',6);
      const buffer=await read(req,512*1024*1024);
      const imported=importSiq(buffer);
      // Recheck after upload: another request may have started the game meanwhile.
      if(room.status!=='lobby') throw new Error('Игра уже началась.');
      installPack(room,imported);
      return json(res,200,{ok:true,warnings:room.pack.warnings});
    }
    if(req.method==='POST'&&url.pathname==='/api/library'){
      const body=JSON.parse((await read(req,4096)).toString()),room=getRoom(body.code),user=authenticate(room,bearer(req));
      if(user.id!=='host'||room.status!=='lobby')throw new Error('Пакет меняет ведущий в лобби.');
      if(body.id==='demo'){room.pack=demoPack();room.revision++;changed(room);return json(res,200,{ok:true});}
      if(body.id==='mechanics'){room.pack=advancedDemoPack();room.revision++;changed(room);return json(res,200,{ok:true});}
      const id=String(body.id||'');
      if(path.basename(id)!==id||!id.toLowerCase().endsWith('.siq'))throw new Error('Пакет не найден.');
      const file=path.join(base,'packs',id);if(!fs.existsSync(file))throw new Error('Пакет не найден.');
      rateLimit(req,'upload',6);const imported=importSiq(fs.readFileSync(file));imported.pack.libraryId=id;installPack(room,imported);
      return json(res,200,{ok:true});
    }
    if(req.method==='GET'&&/^\/avatars\/[a-f0-9]{32}\.png$/.test(url.pathname)){
      const file=path.join(dataDir,'avatars',path.basename(url.pathname));
      if(!fs.existsSync(file))return json(res,404,{error:'Фото не найдено.'});
      res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=31536000, immutable'});
      return fs.createReadStream(file).pipe(res);
    }
    if(req.method==='GET' && /^\/media\/[A-Z2-9]{6}\/[a-f0-9]{32}$/.test(url.pathname)) {
      const [, ,code,id]=url.pathname.split('/'), dest=path.join(dataDir,'media',code,id);
      if(!fs.existsSync(dest)) {res.writeHead(404);return res.end();}
      const stat=fs.statSync(dest), contentType=fs.readFileSync(dest+'.mime','utf8');
      // Byte ranges allow seeking in package audio/video.
      const range=req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
      let start=0,end=stat.size-1,status=200;
      if(range){
        if(range[1]){start=Number(range[1]);end=range[2]?Number(range[2]):end;}
        else if(range[2])start=Math.max(0,stat.size-Number(range[2]));
        end=Math.min(end,stat.size-1);
        if(start>end || start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});return res.end();}
        status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${stat.size}`);
      }
      res.writeHead(status,{'Content-Type':contentType,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'private, max-age=3600'});
      return fs.createReadStream(dest,{start,end}).pipe(res);
    }
    if(req.method==='GET'&&url.pathname==='/demo/tone.wav'){
      const audio=demoTone();res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':audio.length,'Cache-Control':'public, max-age=3600'});return res.end(audio);
    }
    if(req.method==='GET' && ['/', '/index.html','/app.js','/advanced-ui.js','/preload-client.js','/media-view.js','/profile-ui.js','/camera-client.js','/vendor/vdoninja-sdk.js','/vendor/crypto-js.js','/vendor/VDONINJA-LICENSE.txt','/vendor/CRYPTOJS-LICENSE.txt','/final-ui.js','/style.css','/advanced.css','/favicon.svg','/demo/point.svg'].includes(url.pathname)) {
      const file=path.join(base,'public',url.pathname==='/'?'index.html':url.pathname.slice(1));
      res.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-cache'});
      return fs.createReadStream(file).pipe(res);
    }
    json(res,404,{error:'Страница не найдена.'});
  } catch(error) { if(!res.headersSent) json(res,400,{error:error.message || 'Не удалось выполнить действие.'}); else res.end(); }
});

const wss=new WebSocketServer({server,path:'/ws',maxPayload:8192});
wss.on('connection',ws => {
  const authTimeout=setTimeout(() => {if(!ws.code)ws.close(4001,'Auth required');},5000);
  ws.on('pong',payload=>{if(recordPong(ws,payload)){const room=rooms.get(ws.code);if(room)sendLatencies(room);}});
  ws.on('message',buffer=>{
    try {
      const body=JSON.parse(buffer.toString());
      if(body.type==='auth') {
        if(ws.code) throw new Error('Соединение уже авторизовано.');
        const room=getRoom(body.code), user=authenticate(room,body.token);
        ws.code=room.code;ws.auth=body.token;ws.userId=user.id;peers.add(ws);clearTimeout(authTimeout);broadcast(room);probeLatency(ws);
      } else if(body.type==='action') {
        const room=getRoom(ws.code),user=authenticate(room,ws.auth);
        if(body.action==='preload_progress'){reportPreload(room,user,body);preloadChanged(room);return;}
        // Process immediately in one event-loop turn: only the first received buzz wins.
        if(tick(room))changed(room);
        action(room,user,body);changed(room,body.action==='chat');
      } else if(body.type==='ping') ws.send(JSON.stringify({type:'pong',sent:body.sent,now:Date.now()}));
    }catch(error){ws.send(JSON.stringify({type:'error',error:error.message}));}
  });
  ws.on('close',()=>{clearTimeout(authTimeout);peers.delete(ws);const room=rooms.get(ws.code);if(room)broadcast(room);});
  ws.on('error',()=>{});
});
const heartbeat=setInterval(()=>{for(const ws of peers)if(ws.readyState===WebSocket.OPEN)probeLatency(ws);},PING_INTERVAL_MS);
const clock=setInterval(()=>{for(const room of rooms.values())if(tick(room))changed(room);},200);
server.listen(port,process.env.HOST || '0.0.0.0',()=>{
  fs.writeFileSync(path.join(dataDir,'server-control.json'),JSON.stringify({port,token:controlToken}));
  console.log(`Своя компания · http://localhost:${port}`);
  for(const addresses of Object.values(os.networkInterfaces()))for(const addr of addresses || [])if(addr.family==='IPv4'&&!addr.internal)console.log(`В вашей сети: http://${addr.address}:${port}`);
  console.log('Комнаты сохраняются в папке data. Для остановки: Ctrl+C.');
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Порт ${port} уже занят. Возможно, игра уже запущена.`:error.message);process.exit(1);});
function shutdown(){clearInterval(heartbeat);clearInterval(clock);for(const ws of wss.clients)ws.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);

