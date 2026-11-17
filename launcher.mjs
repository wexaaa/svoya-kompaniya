import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {networkAddresses} from './lib/network.mjs';

const base=path.dirname(fileURLToPath(import.meta.url));
const port=process.env.PORT||'3100',local=`http://127.0.0.1:${port}`;
const data=path.join(base,'data');fs.mkdirSync(data,{recursive:true});
const publicFile=path.join(data,'public-url.txt');
const internet=process.argv.includes('--internet');
const radmin=process.argv.includes('--radmin');
if(radmin&&internet)throw new Error('Выберите один режим запуска: Radmin или интернет-туннель.');
const radminUrl=networkAddresses(port).radminUrl;
if(radmin&&!radminUrl){console.error('Не найден сетевой адаптер Radmin VPN. Установите и включите Radmin VPN, затем запустите игру ещё раз.');process.exit(1);}
let server,tunnel,stopping=false;
console.log('\n  СВОЯ КОМПАНИЯ\n  Игра для друзей с сервером на вашем ПК\n');
let existing=false;
try{const response=await fetch(local+'/api/info',{signal:AbortSignal.timeout(1500)});const info=await response.json();existing=info.title==='Своя компания';if(existing&&radmin&&info.shareMode!=='radmin'){console.error('Игра сейчас запущена в другом режиме. Сначала запустите STOP-GAME.cmd, затем START-RADMIN.cmd. Комнаты и счёт сохранятся.');process.exit(1);}}catch{}
if(existing){console.log('Игра уже запущена. Подключаюсь к ней.');}
else{
  fs.rmSync(publicFile,{force:true});
  server=spawn(process.execPath,[path.join(base,'server.mjs')],{cwd:base,stdio:'inherit',windowsHide:true,env:{...process.env,SHARE_MODE:radmin?'radmin':'local',HOST:radmin?'0.0.0.0':process.env.HOST||'0.0.0.0'}});
  server.on('exit',code=>{if(!stopping){console.log(`Сервер остановлен (${code}).`);stop(code||0);}});
  let ready=false;
  for(let i=0;i<40;i++){try{const r=await fetch(local+'/api/info',{signal:AbortSignal.timeout(500)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  if(!ready){console.error('Сервер не запустился. Проверьте, не занят ли порт 3100.');stop(1);}
}
console.log(`\n  ОТКРОЙТЕ В БРАУЗЕРЕ: http://localhost:${port}\n`);
if(radmin)console.log(`  РЕЖИМ RADMIN VPN · без Cloudflare\n\n  ССЫЛКА ДЛЯ ДРУЗЕЙ: ${radminUrl}\n\n  Все участники должны войти в одну сеть Radmin VPN.\n  В игре нажмите «Пригласить», чтобы скопировать ссылку с кодом комнаты.\n  Если друзья не могут зайти: запустите ALLOW-RADMIN.cmd.\n`);
if(internet){
  const binary=path.join(base,'runtime',process.platform==='win32'?'cloudflared.exe':'cloudflared');
  if(!fs.existsSync(binary)){console.error('Не найден runtime/cloudflared.exe. Распакуйте весь архив. Локальная игра доступна.');}
  else{
    console.log('Создаём интернет-ссылку для друзей. Это может занять 10–30 секунд…');
    tunnel=spawn(binary,['tunnel','--no-autoupdate','--protocol','auto','--url',local],{cwd:base,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let found=false,registered=false,buffer='';
    const output=chunk=>{
      const text=chunk.toString();buffer=(buffer+text).slice(-10000);
      const match=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if(text.includes('Registered tunnel connection'))registered=true;
      if(match&&registered&&!found){found=true;fs.writeFileSync(publicFile,match[0]);console.log(`\n  ССЫЛКА ДЛЯ ДРУЗЕЙ: ${match[0]}\n\n  Создайте комнату в браузере и нажмите «Пригласить».\n  Не закрывайте это окно, пока играете.\n`);}
      if(/ERR|error|failed/i.test(text))console.log(text.trim());
    };
    tunnel.stdout.on('data',output);tunnel.stderr.on('data',output);
    tunnel.on('error',error=>console.error('Не удалось открыть туннель:',error.message));
    tunnel.on('exit',code=>{fs.rmSync(publicFile,{force:true});if(!stopping)console.log(`Интернет-туннель закрыт (${code}). Локальная игра продолжает работать. Перезапустите START-INTERNET.cmd.`);});
    setTimeout(()=>{if(!found&&!stopping)console.log('Туннель пока не выдал ссылку. Проверьте интернет/VPN. Локальная игра доступна.');},45000).unref();
  }
}
console.log('Остановка: Ctrl+C или закройте окно.');
if(!server&&!tunnel)setInterval(()=>{},60000);
function stop(code=0){if(stopping)return;stopping=true;tunnel?.kill();server?.kill();fs.rmSync(publicFile,{force:true});setTimeout(()=>process.exit(code),500).unref();}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
