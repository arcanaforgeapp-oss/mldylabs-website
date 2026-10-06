(() => {
  'use strict';
  const KEY='mldy.analytics.consent.v1', ID='mldy.analytics.daily.v1';
  const blocked=()=>navigator.globalPrivacyControl===true || navigator.doNotTrack==='1' || window.doNotTrack==='1';
  const read=k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}};
  const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
  const remove=k=>{try{localStorage.removeItem(k);}catch{}};
  const allowed=()=>{const c=read(KEY);return !blocked() && c?.choice==='allow' && Date.now()-c.at<180*86400000;};
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let memoryId=null, running=false, lastPageDay=null;
  const pending=new Set();
  function visitor(){
    const day=today();let v=read(ID)||memoryId;
    if(!v || v.day!==day){v={day,id:Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('')};write(ID,v);memoryId=v;}
    return v.id;
  }
  function page(){const p=location.pathname.replace(/\.html$/,'').replace(/\/$/,'');return p===''||p==='/index'?'/':p;}
  function send(kind,name,force=false){
    if(!force && (!allowed() || (document.hidden && kind==='heartbeat')))return;
    const data={consent:true,visitor:visitor(),id:crypto.randomUUID(),kind,page:page()};if(name)data.name=name;
    const payload=JSON.stringify(data);
    // keepalive allows click navigation without blocking links. Never send href, referrer, queries or form data.
    const request=fetch('/api/visitors',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,keepalive:true,credentials:'omit',referrerPolicy:'no-referrer'}).catch(()=>{});
    pending.add(request);request.finally(()=>pending.delete(request));
  }
  function tick(){if(!allowed())return;const d=today();if(lastPageDay!==d){send('pageview');lastPageDay=d;}else send('heartbeat');}
  function start(){if(!running){running=true;tick();}}
  function choose(choice){
    let withdrawal=null;
    if(choice==='deny' && allowed())withdrawal=JSON.stringify({consent:true,visitor:visitor(),id:crypto.randomUUID(),kind:'withdraw',page:page()});
    write(KEY,{choice,at:Date.now(),version:1});
    if(choice==='deny'){remove(ID);memoryId=null;running=false;lastPageDay=null;}
    document.getElementById('mldy-analytics-choice')?.remove();if(allowed())start();
    if(withdrawal)Promise.allSettled([...pending]).then(()=>fetch('/api/visitors',{method:'POST',headers:{'Content-Type':'application/json'},body:withdrawal,keepalive:true,credentials:'omit',referrerPolicy:'no-referrer'}).catch(()=>{}));
  }
  function showChoice(){
    document.getElementById('mldy-analytics-choice')?.remove();
    const box=document.createElement('section');box.id='mldy-analytics-choice';box.setAttribute('aria-label','Analytics privacy choices');
    box.innerHTML='<p><strong>Optional website analytics</strong><br>Help us count visits and useful clicks. No names, fingerprinting, or cross-site tracking. <a href="/privacy.html">Privacy notice</a></p><div><button type="button" data-choice="deny">Decline</button><button type="button" data-choice="allow">Allow analytics</button></div>';
    if(blocked()){box.querySelector('p').innerHTML='<strong>Your privacy preference is respected.</strong><br>Analytics are disabled by your browser’s privacy signal.';box.querySelector('[data-choice="allow"]').remove();}
    box.addEventListener('click',e=>{const b=e.target.closest('[data-choice]');if(b)choose(b.dataset.choice);});
    document.body.append(box);
  }
  const style=document.createElement('style');style.textContent='#mldy-analytics-choice{position:fixed;z-index:9999;bottom:18px;left:18px;max-width:390px;width:calc(100% - 36px);padding:16px;background:#101827;color:#eef2fa;border:1px solid #64748b;border-radius:12px;font:14px/1.5 system-ui;box-shadow:0 8px 28px #0005}#mldy-analytics-choice p{margin:0 0 12px;color:#eef2fa;font-size:14px}#mldy-analytics-choice a{color:#b9d9ff;text-decoration:underline}#mldy-analytics-choice div{display:flex;gap:10px}#mldy-analytics-choice button{flex:1;padding:9px 12px;border:1px solid #94a3b8;border-radius:7px;background:#26354a;color:white;font:600 14px system-ui;cursor:pointer}#mldy-analytics-choice button:focus-visible{outline:3px solid #c5a66a}#mldy-analytics-settings{background:none;border:0;color:inherit;font:inherit;text-decoration:underline;cursor:pointer;padding:8px}';document.head.append(style);
  const settings=document.createElement('button');settings.id='mldy-analytics-settings';settings.type='button';settings.textContent='Analytics preferences';settings.addEventListener('click',showChoice);(document.querySelector('footer')||document.body).append(settings);
  const pref=read(KEY);if(!blocked() && (!pref||Date.now()-pref.at>=180*86400000))showChoice();
  if(allowed())start();else remove(ID);
  setInterval(()=>{if(allowed())tick();},15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&allowed())tick();});
  window.addEventListener('storage',e=>{if(e.key===KEY){if(allowed()){start();}else{running=false;lastPageDay=null;memoryId=null;}}});
  document.addEventListener('click',e=>{
    const el=e.target.closest('a,button');if(!el||el.id?.startsWith('mldy-analytics')||el.closest('#mldy-analytics-choice'))return;
    if(el.dataset.analyticsEvent){send('event',el.dataset.analyticsEvent);return;}
    if(el.matches('#app-nav button,[data-screen],#zoom-button,#reading-variant')){send('event','preview_interaction');return;}
    if(el.tagName!=='A')return;
    const url=new URL(el.href,location.href);
    if(/\.(exe|zip)$/i.test(url.pathname)){const p=page();const product=['quicksign','convert','teleprompter','image'].find(s=>p.includes(s)||url.pathname.toLowerCase().includes(s));send('event',product?'download_'+product:'download_other');}
    else if(url.protocol==='mailto:')send('event','support_click');
    else if(url.hostname==='mldyaf.com'||url.hostname==='www.mldyaf.com')send('event','visit_arcana');
    else if(url.hostname==='mldylabs.com'||url.hostname==='www.mldylabs.com'){if(location.hostname.includes('mldyaf'))send('event','visit_labs');}
    else if(url.hash==='#products')send('event','explore_products');
    else if(url.hash==='#preview')send('event','explore_preview');
  });
  document.addEventListener('change',e=>{if(e.target.id==='screen-select')send('event','preview_interaction');});
})();
