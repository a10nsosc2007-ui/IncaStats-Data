/* INCASTATS APP V3 - SAFE RESCUE LAYER
 * Works with V2.8/V2.9 view IDs; no external API calls, no keys, no fake odds.
 * Does not replace existing analyser, streaks or authentication modules.
 */
(() => {
  'use strict';
  const VERSION='3.0.0-rescate';
  const $=id=>document.getElementById(id);
  const errors=[];
  const addError=(kind,err)=>{errors.push({when:new Date().toISOString(),kind,message:String(err?.message||err||'Error').slice(0,230)});if(errors.length>25)errors.shift();};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.addEventListener('error',e=>{if(/inca|titan|streak|scan|odds|referee|player|analiz/i.test(String(e.filename||'')+' '+e.message))addError('js',e.message);});
  window.addEventListener('unhandledrejection',e=>addError('promise',e.reason));
  function isGateClosed(){
    if(document.documentElement.classList.contains('inca-auth-pending'))return false;
    const gate=$('incaAuthGate');
    if(!gate)return false; // Never invent auth state or bypass a missing gate.
    const style=getComputedStyle(gate);
    return gate.hidden||style.display==='none'||style.visibility==='hidden'||gate.getAttribute('aria-hidden')==='true';
  }
  function scannerVisible(){
    if(!isGateClosed())return false;
    const node=$('scannerView');if(!node)return false;
    const s=getComputedStyle(node);const rect=node.getBoundingClientRect();
    return !node.hidden && s.display!=='none' && s.visibility!=='hidden' && rect.width>0 && rect.height>20 &&
      !node.classList.contains('portal-hidden') &&
      !document.body.classList.contains('inca-auth-locked');
  }
  function rescueScanner(){
    if(!isGateClosed()){addError('scanner','Auth gate visible: repair blocked');return false;}
    const node=$('scannerView'), shell=$('incaPortal');
    if(!node){addError('scanner','No existe #scannerView');return false;}
    try{
      window.INCA_PORTAL_NAV?.show?.('scanner');
      if(scannerVisible())return true;
      shell?.classList.add('portal-shell-hidden');
      node.hidden=false;node.classList.remove('portal-hidden');node.removeAttribute('aria-hidden');
      node.style.setProperty('display','block','important');
      node.style.setProperty('visibility','visible');
      document.body.classList.add('scanner-active');
      document.querySelector('.portal-nav')?.classList.remove('open');
      window.dispatchEvent(new Event('resize'));
      document.dispatchEvent(new CustomEvent('inca:scanner-visible'));
      if(typeof node.focus==='function'){node.setAttribute('tabindex','-1');node.focus({preventScroll:true});}
      return scannerVisible();
    }catch(e){addError('scanner',e);return false;}
  }
  function showScannerError(){
    if($('incaV3ScannerAlert'))return;
    const target=$('scannerView')||document.body;
    const box=document.createElement('div');box.id='incaV3ScannerAlert';box.setAttribute('role','alert');
    box.className='inca-v3-repair-alert';
    box.innerHTML='<strong>No se pudo abrir el Analizador.</strong><span>Comprueba que los archivos de la aplicación se hayan cargado correctamente.</span><button type="button">Reintentar</button>';
    box.querySelector('button').addEventListener('click',()=>{box.remove();rescueScanner();});
    target.prepend(box);
  }
  let scanTimer=0;
  document.addEventListener('click',e=>{
    const target=e.target.closest?.('[data-view="scanner"],[data-open-scanner],[data-open="scanner"]');
    if(!target)return;
    // Do not interfere with the original handlers: this is a post-click safety net.
    clearTimeout(scanTimer);
    scanTimer=setTimeout(()=>{
      if(isGateClosed()&&!scannerVisible()) {
        if(!rescueScanner())showScannerError();
      }
    },160);
  },true);
  document.addEventListener('keydown',e=>{
    if(e.altKey&&!e.ctrlKey&&!e.metaKey&&e.key.toLowerCase()==='a'){
      const tag=document.activeElement?.tagName||'';
      if(/INPUT|TEXTAREA|SELECT/.test(tag))return;
      e.preventDefault();if(!rescueScanner())showScannerError();
    }
  });
  // A lightweight status layer for odds from existing backend/cache only.
  // This function never requests The Odds API directly, never accesses keys.
  function pricesFromResponse(x){
    const list=[];
    const seen=new Set();
    function rec(node,depth){
      if(depth>8||!node||typeof node!=='object'||seen.has(node)||list.length>100000)return;
      seen.add(node);
      if(Array.isArray(node)){for(const v of node.slice(0,12000))rec(v,depth+1);return;}
      if(Number.isFinite(Number(node.price))&&Number(node.price)>1.001&&Number(node.price)<200 &&
         (node.name||node.outcome||node.selection||node.market_key||node.market)){
        list.push(Number(node.price));
      }
      for(const [k,v] of Object.entries(node)){
        if(k==='metadata'||k==='teams'||k==='players'||k==='images')continue;
        if(Array.isArray(v)||v&&typeof v==='object')rec(v,depth+1);
      }
    }
    rec(x,0);
    return list;
  }
  async function cacheStatus(){
    const cache=window.INCA_API_CACHE;
    if(!cache||typeof cache.get!=='function')return {status:'SIN_LECTOR_CACHE',prices:0,fixtures:null};
    let odds=null,fx=null,err='';
    try{odds=await cache.get('odds',{},1000);}catch(e){err=String(e?.message||e).slice(0,100);}
    try{fx=await cache.get('fixtures',{},1000);}catch(e){if(!err)err=String(e?.message||e).slice(0,100);}
    const arr=x=>Array.isArray(x)?x:(x?.events||x?.fixtures||x?.items||x?.data||x?.odds||[]);
    const prices=pricesFromResponse(odds);
    let stamp=odds?.fetched_at||odds?.updated_at||odds?.generated_at||odds?.timestamp||null;
    const age=stamp?(Date.now()-new Date(stamp).getTime())/3600000:null;
    return {status:err?'LECTURA_PARCIAL':'OK',events:arr(odds).length,prices:prices.length,fixtures:arr(fx).length,
      oldestKnownHours:age===null||!Number.isFinite(age)?null:+age.toFixed(1),error:err||undefined};
  }
  async function inspect(){
    const s=$('scannerView'),p=$('portalStreaks'),q=$('portalPlayers');
    const status=await cacheStatus();
    return {version:VERSION,modules:{
      navigation:!!window.INCA_PORTAL_NAV,scanner:!!s,scannerVisible:scannerVisible(),
      titan:!!window.INCA_TITAN,players:!!window.INCA_PLAYERS,authPassed:isGateClosed(),
      playerProps:!!window.INCA_PLAYER_PROPS,referees:!!window.INCA_REFEREES,
      streaks:!!window.INCA_STREAKS_PRO,fixtures:!!window.INCA_MATCH_CENTER,
      streaksPanel:!!p,playersPanel:!!q},
      titanCount:window.INCA_TITAN?.getCatalog?.()?.teams?.length??null,
      oddsCache:status,errors:[...errors]};
  }
  const report=async()=>{const data=await inspect();console.group('[INCASTATS V3] Diagnóstico local (sin claves)');console.table(data.modules);console.info('Cuotas cacheadas:',data.oddsCache);console.info('Equipo TITAN:',data.titanCount);console.info('Errores observados:',data.errors);console.groupEnd();return data;};
  // Re-run existing streak engine after the app signals real cache updates,
  // never on every filter keystroke and never trigger an upstream API call.
  let streakTimer=0;
  for(const signal of ['inca:odds-cache-ready','inca:odds-cache-updated','inca:fixtures-cache-ready']){
    window.addEventListener(signal,()=>{
      clearTimeout(streakTimer);streakTimer=setTimeout(()=>{
        if($('portalStreaks')&&!$('portalStreaks').classList.contains('portal-hidden'))
          Promise.resolve(window.INCA_STREAKS_PRO?.run?.()).catch(e=>addError('streaks',e));
      },700);
    });
  }
  window.INCA_V3_RESCUE=Object.freeze({version:VERSION,rescueScanner,scannerVisible,inspect,report,cacheStatus});
  document.documentElement.dataset.incaV3Rescue='1';
})();