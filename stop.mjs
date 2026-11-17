import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url));
try{
  const control=JSON.parse(fs.readFileSync(path.join(base,'data','server-control.json'),'utf8'));
  const response=await fetch(`http://127.0.0.1:${Number(control.port)}/api/shutdown`,{method:'POST',headers:{Authorization:`Bearer ${control.token}`},signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw new Error();
  console.log('Игра остановлена. Интернет-ссылка будет отключена.');
}catch{console.log('Игра уже остановлена или запущена из другой папки.');}
