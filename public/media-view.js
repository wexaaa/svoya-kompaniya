// Enlarge the existing video node with CSS so playback, volume and host synchronization stay intact.
let state,expanded,questionId,toolbar;
const bound=new WeakSet(),dismissed=new Set();
const key=video=>`${questionId}|${video.dataset.media}`;

function controls(){
  if(toolbar)return;
  toolbar=document.createElement('div');toolbar.id='media-view-toolbar';toolbar.hidden=true;
  const close=document.createElement('button');close.className='button small ghost';close.textContent='Свернуть видео · Esc';close.setAttribute('aria-label','Свернуть увеличенное видео');close.onclick=()=>closeVideoView(true);
  toolbar.append(close);document.body.append(toolbar);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&expanded){event.preventDefault();closeVideoView(true);}});
}

export function closeVideoView(dismiss=false){
  if(dismiss&&expanded)dismissed.add(key(expanded));
  expanded?.classList.remove('cinema-video');expanded=null;
  document.body.classList.remove('portrait-cinema');if(toolbar)toolbar.hidden=true;
}

function open(video){
  if(state?.paused||!video.isConnected)return;
  controls();expanded?.classList.remove('cinema-video');expanded=video;
  dismissed.delete(key(video));video.classList.add('cinema-video');document.body.classList.add('portrait-cinema');toolbar.hidden=false;
}

export function syncVideoView(nextState){
  state=nextState;
  const nextQuestion=state?.current?`${state.code}|${state.current.id}`:null;
  if(!state||nextQuestion!==questionId){closeVideoView();dismissed.clear();questionId=nextQuestion;}
  if(!state||!state.current||state.paused){closeVideoView();return;}
  if(expanded&&!expanded.isConnected)closeVideoView();
  const activeUrls=new Set(Object.keys(state.playback||{}).flatMap(url=>{try{return [new URL(url,location.origin).href];}catch{return [];}}));
  for(const video of document.querySelectorAll('#app video[data-media]')){
    if(!activeUrls.has(video.dataset.media)||video.closest('.host-answer'))continue;
    if(!bound.has(video)){
      bound.add(video);video.addEventListener('loadedmetadata',()=>syncVideoView(state));
    }
    if(!video.nextElementSibling?.classList.contains('media-expand')){
      const button=document.createElement('button');button.type='button';button.className='button small media-expand';button.textContent='Увеличить видео ↗';button.onclick=()=>open(video);
      video.insertAdjacentElement('afterend',button);
    }
    if(!expanded&&video.videoHeight>video.videoWidth&&video.videoWidth>0&&!dismissed.has(key(video)))open(video);
  }
}
