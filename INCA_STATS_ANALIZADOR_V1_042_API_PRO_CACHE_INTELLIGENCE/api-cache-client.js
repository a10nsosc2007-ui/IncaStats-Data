
(() => {
  'use strict';
  const CFG=()=>window.INCA_ARCH||{};
  const memory=new Map();
  const inflight=new Map();
  const endpoint=()=>CFG().apiCacheEndpoint||'./api/football-cache';
  const staticDev=()=>/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(location.hostname||'') && !/^300\d$/.test(location.port||'');
  const localFiles={
    fixtures:'./data/api-cache/fixtures_current.json',
    odds:'./data/api-cache/odds_current.json',
    playerprops:'./data/api-cache/playerprops_current.json',
    referees:'./data/api-cache/referees_current.json',
    markets:'./data/api-cache/markets_current.json',
    status:'./data/api-cache/status.json',
    lineups:'./data/api-cache/lineups_current.json'
  };
  async function token(){
    try{
      const s=await window.INCA_AUTH?.client?.auth?.getSession?.();
      return s?.data?.session?.access_token||'';
    }catch{return '';}
  }
  async function local(action){
    const file=localFiles[action];
    if(!file)throw new Error('LOCAL_CACHE_UNAVAILABLE');
    const r=await fetch(`${file}?v=1.042`,{cache:'no-store'});
    if(!r.ok)throw new Error(`LOCAL_${r.status}`);
    return r.json();
  }
  async function remote(action,params={}){
    const u=new URL(endpoint(),location.href);u.searchParams.set('action',action);
    Object.entries(params).forEach(([k,v])=>v!==undefined&&v!==null&&v!==''&&u.searchParams.set(k,String(v)));
    const headers={accept:'application/json'};const t=await token();if(t)headers.Authorization=`Bearer ${t}`;
    const r=await fetch(u,{headers,cache:'default'});
    if(!r.ok)throw new Error(`CACHE_${r.status}`);
    return r.json();
  }
  async function get(action,params={},ttl=5*60*1000){
    const key=`${action}|${JSON.stringify(params)}`,now=Date.now(),hit=memory.get(key);
    if(hit&&now-hit.time<ttl)return hit.data;
    if(inflight.has(key))return inflight.get(key);
    const p=(async()=>{
      let data;
      try{data=staticDev()?await local(action):await remote(action,params);}
      catch(e){
        if(!staticDev())try{data=await local(action);}catch{}
        if(!data)throw e;
      }
      memory.set(key,{time:Date.now(),data});return data;
    })().finally(()=>inflight.delete(key));
    inflight.set(key,p);return p;
  }
  const clear=()=>memory.clear();
  window.INCA_API_CACHE=Object.freeze({get,clear,mode:'CACHE_ONLY'});
})();
