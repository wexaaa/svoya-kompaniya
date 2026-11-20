import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('Windows launchers work with UTF-8 console, LF/CRLF, Cyrillic paths and portable/installed Node', {skip:process.platform!=='win32'},()=>{
  const temp=fs.mkdtempSync(path.resolve('test','.runtime-launcher-'));
  const root=path.join(temp,'Игра с пробелами'),scripts=path.join(root,'scripts'),runtime=path.join(root,'runtime');
  fs.mkdirSync(scripts,{recursive:true});fs.mkdirSync(runtime);
  const helper=fs.readFileSync('scripts/run-node.cmd','utf8');
  assert.ok(!/[^\x00-\x7f]/.test(helper),'Keep the bootstrap ASCII: cmd.exe can misparse multibyte UTF-8 batch text after chcp 65001.');
  const exe=path.join(runtime,'node.exe');
  try{fs.linkSync(process.execPath,exe);}catch{fs.copyFileSync(process.execPath,exe);}
  const envFor=installed=>{
    const env={...process.env};for(const key of Object.keys(env))if(key.toLowerCase()==='path')delete env[key];
    env.Path=[...(installed?[path.dirname(process.execPath)]:[]),path.join(process.env.SystemRoot,'System32')].join(';');return env;
  };
  const run=(line,installed=false)=>spawnSync(path.join(process.env.SystemRoot,'System32','cmd.exe'),['/d','/c',line],{cwd:root,encoding:'utf8',input:'\r\n',env:envFor(installed),windowsHide:true,windowsVerbatimArguments:true,timeout:15000});
  const script=path.join(root,'Проверка аргументов.mjs');
  fs.writeFileSync(script,"console.log(JSON.stringify({args:process.argv.slice(2)}));process.exit(7);");
  try{
    for(const newline of ['\n','\r\n']){
      fs.writeFileSync(path.join(scripts,'run-node.cmd'),helper.replace(/\r?\n/g,newline),'ascii');
      for(const installed of [false,true]){
        if(installed)fs.renameSync(exe,exe+'.disabled');
        const result=run(`chcp 65001>nul & call "${path.join(scripts,'run-node.cmd')}" "${script}" "argument with spaces"`,installed);
        if(installed)fs.renameSync(exe+'.disabled',exe);
        assert.equal(result.status,7,result.stderr);assert.equal(result.stderr,'');
        assert.deepEqual(JSON.parse(result.stdout.trim()).args,['argument with spaces']);
      }
    }
    fs.writeFileSync(path.join(root,'launcher.mjs'),"console.log('LAUNCH_ARGS='+JSON.stringify(process.argv.slice(2)));");
    fs.writeFileSync(path.join(root,'stop.mjs'),"console.log('STOP_OK');");
    for(const [file,args] of [['START-LOCAL.cmd',[]],['START-RADMIN.cmd',['--radmin']],['START-INTERNET.cmd',['--internet']],['STOP-GAME.cmd',null]]){
      fs.writeFileSync(path.join(root,file),fs.readFileSync(file,'utf8').replace(/\r?\n/g,'\n'),'ascii');
      const result=run(`call "${path.join(root,file)}"`);
      assert.equal(result.stderr,'',`${file}: ${result.stderr}`);
      assert.ok(result.stdout.includes(args?'LAUNCH_ARGS='+JSON.stringify(args):'STOP_OK'),`${file}: ${result.stdout}`);
    }
    fs.renameSync(exe,exe+'.disabled');
    const missing=run('chcp 65001>nul & call scripts\\run-node.cmd --version');
    assert.equal(missing.status,1);assert.equal(missing.stderr,'');assert.ok(missing.stdout.includes('Node.js 22 or newer was not found.'));
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
