import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {localCryptoSDK} from '../public/camera-client.js';

test('HTTP viewer crypto interoperates with the unmodified official VDO WebCrypto implementation',async()=>{
  const load=file=>{
    const context={module:{exports:{}},crypto:webcrypto,TextEncoder,TextDecoder,EventTarget,Uint8Array,ArrayBuffer,setTimeout,clearTimeout,setInterval,clearInterval,console,Map,Set,Date};
    context.exports=context.module.exports;
    context.global=context;context.globalThis=context;
    vm.runInNewContext(fs.readFileSync(new URL(file,import.meta.url),'utf8'),context);
    return context.module.exports;
  };
  const Base=load('../public/vendor/vdoninja-sdk.js'),C=load('../public/vendor/crypto-js.js');
  const Native=new Base({password:'testSecret123',salt:'vdo.ninja'}),Local=new (localCryptoSDK(Base,C))({password:'testSecret123',salt:'vdo.ninja'});
  for(const message of ['simple text','{"answer":"Привет! ✨"}', 'x'.repeat(1001)]){
    assert.equal(await Local._generateHash(message),await Native._generateHash(message));
    assert.equal(await Local._generateHash(message,6),await Native._generateHash(message,6));
    const [encrypted,iv]=await Native._encryptMessage(message);
    assert.equal(await Local._decryptMessage(encrypted,iv),await Native._decryptMessage(encrypted,iv));
    const [localEncrypted,localIV]=await Local._encryptMessage(message);
    assert.equal(await Native._decryptMessage(localEncrypted,localIV),await Local._decryptMessage(localEncrypted,localIV));
  }
});
