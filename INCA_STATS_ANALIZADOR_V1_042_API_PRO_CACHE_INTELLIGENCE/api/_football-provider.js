'use strict';

const API='https://v3.football.api-sports.io';
const SUPA=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'https://jijxmshpzcoalohlhhnb.supabase.co';
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY||'';

function clamp(v,min,max,fallback){const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
function poolMode(){return String(process.env.INCA_API_KEY_POOL_MODE||'single').toLowerCase();}
function rawEntries(){
  const found=[];
  const push=(alias,value)=>{const key=String(value||'').trim();if(!key||found.some(x=>x.key===key))return;found.push({alias,key});};
  push('API_FOOTBALL_KEY',process.env.API_FOOTBALL_KEY||process.env.APISPORTS_KEY);
  for(let i=1;i<=9;i++)push(`API_FOOTBALL_KEY_${i}`,process.env[`API_FOOTBALL_KEY_${i}`]);
  return found;
}
function keyEntries(){const all=rawEntries();return poolMode()==='authorized'?all:all.slice(0,1);}
function monthlyLimit(){return clamp(process.env.INCA_API_PER_KEY_MONTHLY_BUDGET,1,100000,450);}
function defaultDaily(count){return count>1?Math.min(140,Math.max(15,count*14)):15;}
function maxDaily(count){return clamp(process.env.INCA_API_DAILY_BUDGET,1,100000,defaultDaily(count));}
function maxRun(count,daily){return clamp(process.env.INCA_API_RUN_BUDGET,1,daily,Math.max(8,Math.ceil(daily/2)));}

async function supa(path,opt={}){
  if(!SERVICE)throw new Error('SUPABASE_SERVICE_ROLE_KEY_MISSING');
  const r=await fetch(`${SUPA}/rest/v1/${path}`,{
    ...opt,
    headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal',...(opt.headers||{})}
  });
  if(!r.ok)throw new Error(`SUPABASE_${r.status}_${await r.text()}`);
  return r;
}
async function rows(path){const r=await supa(path,{headers:{Prefer:'return=representation'}});return r.json();}
async function rpc(name,body){
  const r=await supa(`rpc/${name}`,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body||{})});
  return r.json();
}
async function ensurePoolState(entries){
  if(!entries.length)return;
  const limit=monthlyLimit(),now=new Date().toISOString();
  // Solo crea aliases faltantes. No pisa enabled/cooldown/contadores de una key existente.
  const payload=entries.map(x=>({provider:'api-football',key_alias:x.alias,monthly_limit:limit,meta:{env_slot:x.alias},updated_at:now}));
  await supa('football_api_key_state?on_conflict=provider,key_alias',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(payload)});
}
async function currentDailyUsed(){
  const day=new Date().toISOString().slice(0,10);
  const x=await rows(`football_api_usage_daily?select=*&day=eq.${day}&limit=1`).catch(()=>[]);
  return Number(x?.[0]?.used||0);
}
async function saveDailyUsed(used,meta={}){
  const day=new Date().toISOString().slice(0,10);
  await supa('football_api_usage_daily?on_conflict=day',{method:'POST',body:JSON.stringify([{day,used:Number(used)||0,last_run_at:new Date().toISOString(),meta}])});
}
async function createBudget(runName='sync'){
  const entries=keyEntries();
  if(!entries.length)throw new Error('API_FOOTBALL_KEY_MISSING');
  await ensurePoolState(entries).catch(e=>{if(!/football_api_key_state|PGRST|404/i.test(String(e.message)))throw e;});
  const legacyUsed=await currentDailyUsed();
  const today=new Date().toISOString().slice(0,10),aliases=new Set(entries.map(x=>x.alias));
  const states=await rows('football_api_key_state?select=key_alias,day_key,day_used&provider=eq.api-football').catch(()=>[]);
  const stateUsed=states.filter(x=>aliases.has(x.key_alias)&&String(x.day_key||'')===today).reduce((a,x)=>a+Number(x.day_used||0),0);
  const used=Math.max(legacyUsed,stateUsed);
  const daily=maxDaily(entries.length),run=maxRun(entries.length,daily);
  return {runName,entries,keyMap:new Map(entries.map(x=>[x.alias,x.key])),used,start:used,maxDaily:daily,maxRun:run,keyHits:{},warnings:[]};
}
function budgetCheck(ctx){
  if(ctx.used>=ctx.maxDaily)throw new Error('DAILY_BUDGET_REACHED');
  if(ctx.used-ctx.start>=ctx.maxRun)throw new Error('RUN_BUDGET_REACHED');
}
async function reserveAlias(ctx,aliases){
  const valid=(aliases||ctx.entries.map(x=>x.alias)).filter(a=>ctx.keyMap.has(a));
  if(!valid.length)return null;
  try{
    const data=await rpc('reserve_football_api_key',{p_aliases:valid,p_monthly_limit:monthlyLimit(),p_provider:'api-football'});
    if(typeof data==='string')return data||null;
    if(Array.isArray(data))return data[0]?.key_alias||data[0]||null;
    return data?.key_alias||null;
  }catch(e){
    ctx.warnings.push('POOL_STATE_FALLBACK');
    return valid.sort((a,b)=>(ctx.keyHits[a]||0)-(ctx.keyHits[b]||0))[0]||null;
  }
}
async function markAlias(alias,status,httpStatus,remaining,cooldownSeconds=0,meta={}){
  try{
    await rpc('mark_football_api_key_result',{
      p_key_alias:alias,p_status:String(status||''),p_http_status:Number(httpStatus)||null,
      p_remaining:Number.isFinite(Number(remaining))?Number(remaining):null,p_cooldown_seconds:Math.max(0,Number(cooldownSeconds)||0),p_meta:meta||{},p_provider:'api-football'
    });
  }catch{}
}
function providerErrors(j){
  if(!j?.errors)return '';
  if(Array.isArray(j.errors))return j.errors.join(' ');
  if(typeof j.errors==='object')return Object.entries(j.errors).map(([k,v])=>`${k}:${typeof v==='string'?v:JSON.stringify(v)}`).join(' ');
  return String(j.errors);
}
function remainingHeader(r){
  for(const h of ['x-ratelimit-requests-remaining','x-ratelimit-remaining','x-requests-remaining']){
    const v=r.headers.get(h);if(v!==null&&v!==''){const n=Number(v);if(Number.isFinite(n))return n;}
  }
  return null;
}
function retryClass(httpStatus,errorText){
  const t=String(errorText||'').toLowerCase();
  if(httpStatus===401||httpStatus===403||/invalid.*key|api key|access denied|unauthor/.test(t))return {retry:true,status:'auth_error',cooldown:86400};
  if(httpStatus===429||/quota|rate.?limit|request.*limit|too many|monthly/.test(t))return {retry:true,status:'limit',cooldown:6*3600};
  if(httpStatus>=500)return {retry:true,status:'upstream_error',cooldown:180};
  return {retry:false,status:'error',cooldown:0};
}
async function call(ctx,path,params={}){
  budgetCheck(ctx);
  const aliases=ctx.entries.map(x=>x.alias),attempted=new Set();
  let lastError=null;
  while(attempted.size<aliases.length){
    budgetCheck(ctx);
    const available=aliases.filter(a=>!attempted.has(a));
    const alias=await reserveAlias(ctx,available);
    if(!alias)break;
    attempted.add(alias);
    const key=ctx.keyMap.get(alias);if(!key)continue;
    const u=new URL(API+path);Object.entries(params||{}).forEach(([k,v])=>v!==undefined&&v!==null&&v!==''&&u.searchParams.set(k,String(v)));
    let r,j={};
    try{
      r=await fetch(u,{headers:{'x-apisports-key':key},cache:'no-store'});
      ctx.used++;ctx.keyHits[alias]=(ctx.keyHits[alias]||0)+1;
      j=await r.json().catch(()=>({}));
      const err=providerErrors(j),remaining=remainingHeader(r);
      if(r.ok&&!err){await markAlias(alias,'ok',r.status,remaining,0,{path});return j;}
      const klass=retryClass(r.status,err);
      await markAlias(alias,klass.status,r.status,remaining,klass.cooldown,{path,error:err.slice(0,300)});
      lastError=new Error(`API_${r.status}_${err||'ERROR'}`);
      if(!klass.retry)throw lastError;
    }catch(e){
      if(!r){ctx.used++;ctx.keyHits[alias]=(ctx.keyHits[alias]||0)+1;await markAlias(alias,'network_error',0,null,120,{path,error:String(e.message||e).slice(0,300)});}
      lastError=e;
    }
    if(poolMode()!=='authorized')break;
  }
  throw lastError||new Error('API_KEY_POOL_EXHAUSTED');
}
async function finishBudget(ctx,meta={}){
  const safeHits=Object.fromEntries(Object.entries(ctx.keyHits).map(([k,v])=>[k,Number(v)||0]));
  const merged={...meta,pool_mode:poolMode(),pool_keys:ctx.entries.length,key_hits:safeHits,warnings:[...new Set(ctx.warnings)]};
  await saveDailyUsed(ctx.used,merged);
  return merged;
}
function publicConfig(){const entries=keyEntries();const daily=maxDaily(entries.length);return{pool_mode:poolMode(),configured_keys:entries.length,per_key_monthly_budget:monthlyLimit(),daily_budget:daily,run_budget:maxRun(entries.length,daily)};}

module.exports={API,SUPA,SERVICE,keyEntries,poolMode,monthlyLimit,createBudget,call,finishBudget,supa,rows,publicConfig};
