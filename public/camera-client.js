let libraries;
function loadScript(src) {
  return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(new Error('Не удалось загрузить видеоплеер.'));document.head.append(script);});
}
async function loadLibraries() {
  libraries ||= (async()=>{await loadScript('/vendor/crypto-js.js');await loadScript('/vendor/vdoninja-sdk.js');})();
  return libraries;
}

// The official SDK uses WebCrypto for signaling. Radmin HTTP has no SubtleCrypto.
// These three equivalent operations use bundled CryptoJS without changing browser
// security settings or disabling the VDO password / WebRTC encryption.
export function localCryptoSDK(Base, C) {
  const word = bytes => C.lib.WordArray.create(bytes);
  return class extends Base {
    async _generateHash(text,length=false) {
      const hex=C.SHA256(C.enc.Utf8.parse(text)).toString(C.enc.Hex);
      return length?hex.slice(0,Math.floor(Number(length)/2)*2):hex;
    }
    async _encryptMessage(message,phrase=null) {
      if(!phrase){const pass=this._getEffectivePassword();if(pass===null)throw new Error('Password not set');phrase=pass+this.salt;}
      const iv=word(crypto.getRandomValues(new Uint8Array(16)));
      const key=C.SHA256(word(this._convertStringToArrayBufferView(phrase)));
      const data=word(this._convertStringToArrayBufferView(message));
      const encrypted=C.AES.encrypt(data,key,{iv,mode:C.mode.CBC,padding:C.pad.Pkcs7});
      return [encrypted.ciphertext.toString(C.enc.Hex),iv.toString(C.enc.Hex)];
    }
    async _decryptMessage(data,vector,phrase=null) {
      if(!phrase){const pass=this._getEffectivePassword();if(pass===null)throw new Error('Password not set');phrase=pass+this.salt;}
      const key=C.SHA256(word(this._convertStringToArrayBufferView(phrase)));
      const decrypted=C.AES.decrypt({ciphertext:C.enc.Hex.parse(data)},key,{iv:C.enc.Hex.parse(vector),mode:C.mode.CBC,padding:C.pad.Pkcs7});
      return decrypted.toString(C.enc.Utf8);
    }
  };
}

export function startCamera(node,link) {
  let stopped=false,sdk,timer;
  const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.className='camera-video';
  const label=document.createElement('span');label.className='camera-message';label.textContent='Подключаем видео…';
  node.append(video,label);
  const play=()=>{if(video.srcObject)video.play().catch(()=>{label.textContent='Нажми на страницу, чтобы включить видео';});};
  document.addEventListener('pointerdown',play);
  const cleanup=()=>{stopped=true;clearTimeout(timer);document.removeEventListener('pointerdown',play);sdk?.disconnect().catch(()=>{});video.srcObject?.getTracks().forEach(track=>track.stop());video.srcObject=null;};
  video.addEventListener('playing',()=>{node.classList.add('camera-playing');label.hidden=true;clearTimeout(timer);});
  video.addEventListener('waiting',()=>{label.hidden=false;label.textContent='Ожидаем видео…';});
  (async()=>{
    try{
      await loadLibraries();if(stopped)return;
      const url=new URL(link),params=url.searchParams;
      let password=params.get('password')??undefined;
      if(password==='false'||password==='0')password=false;
      else if(password){try{password=decodeURIComponent(password);}catch{}}
      const SDK=localCryptoSDK(window.VDONinjaSDK,window.CryptoJS);
      sdk=new SDK({password,salt:params.get('salt')||'vdo.ninja'});
      sdk.addEventListener('track',({detail})=>{
        if(stopped||detail.track.kind!=='video')return;
        video.srcObject?.getTracks().forEach(track=>track.stop());
        video.srcObject=new MediaStream([detail.track]);play();
        detail.track.addEventListener('ended',()=>{node.classList.remove('camera-playing');label.hidden=false;label.textContent='Трансляция остановлена';});
      });
      await sdk.connect();if(stopped){await sdk.disconnect();return;}
      if(params.get('room'))await sdk.joinRoom({room:params.get('room')});
      if(stopped){await sdk.disconnect();return;}
      await sdk.view(params.get('view'),{audio:false,video:true,videoBitrate:400});
      timer=setTimeout(()=>{if(!stopped&&!node.classList.contains('camera-playing'))label.textContent='Ждём трансляцию · проверь вкладку VDO.Ninja';},15000);
    }catch(e){if(!stopped){label.hidden=false;label.textContent='Видео недоступно · открой ссылку ниже';}}
  })();
  return cleanup;
}
