(() => {
  'use strict';
  const REMOTE='https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/TITAN_REFEREES_CURRENT/';
  const LOCAL='./data/referees/';
  const VERSION='1.034';
  const REQUIRED_SCHEMA='incastats.referees_master.v9.3';
  const state={
    ready:false,promise:null,master:null,manifest:null,source:'',faceSource:'',error:null,
    history:new Map(),faces:new Map(),byId:new Map(),byName:new Map(),searchRows:[],byCompetition:new Map()
  };
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toLowerCase();
  const tokens=v=>norm(v).split(' ').filter(x=>x.length>1);
  const asId=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:0;};
  async function getJSON(url){
    const r=await fetch(url,{cache:'no-cache',credentials:'omit'});
    if(!r.ok)throw new Error(`HTTP_${r.status}`);
    return r.json();
  }
  function schemaOK(master){return String(master?.schema_version||'')===REQUIRED_SCHEMA&&Array.isArray(master?.referees);}
  async function readPath(base,path,tag){
    const sep=path.includes('?')?'&':'?';
    return {data:await getJSON(`${base}${path}${sep}inca=${VERSION}`),source:tag};
  }
  async function readWithFallback(path,{requireMaster=false}={}){
    let remoteError=null;
    try{
      const out=await readPath(REMOTE,path,'GITHUB');
      if(requireMaster&&!schemaOK(out.data))throw new Error(`SCHEMA_REMOTE_${out.data?.schema_version||'UNKNOWN'}`);
      return out;
    }catch(e){remoteError=e;}
    try{
      const out=await readPath(LOCAL,path,'LOCAL');
      if(requireMaster&&!schemaOK(out.data))throw new Error(`SCHEMA_LOCAL_${out.data?.schema_version||'UNKNOWN'}`);
      return {...out,remoteError};
    }catch(localError){
      const err=new Error(`TITAN_REFEREES_V9_3_UNAVAILABLE · remote=${remoteError?.message||'error'} · local=${localError?.message||'error'}`);
      err.remoteError=remoteError;err.localError=localError;throw err;
    }
  }
  function buildIndexes(){
    state.byId.clear();state.byName.clear();state.byCompetition.clear();state.searchRows=[];
    for(const r of state.master?.referees||[]){
      const id=asId(r?.referee_id||r?.id);if(!id)continue;
      state.byId.set(id,r);
      const nk=norm(r?.name);if(nk&&!state.byName.has(nk))state.byName.set(nk,r);
      const sr={item:r,nk,toks:tokens(r?.name),matches:Number(r?.match_count||0),hasFace:false,last:String(r?.last_match_date||'')};
      state.searchRows.push(sr);
      for(const raw of (r?.competition_ids||r?.discovered_in_competition_ids||[])){
        const cid=asId(raw);if(!cid)continue;
        if(!state.byCompetition.has(cid))state.byCompetition.set(cid,[]);
        state.byCompetition.get(cid).push(r);
      }
    }
  }
  function buildFaceIndex(faceMap){
    state.faces.clear();
    const rows=Array.isArray(faceMap)?faceMap:(Array.isArray(faceMap?.referees)?faceMap.referees:[]);
    rows.forEach(x=>{const id=asId(x?.referee_id||x?.id);if(id)state.faces.set(id,x);});
    for(const s of state.searchRows)s.hasFace=state.faces.has(asId(s.item?.referee_id||s.item?.id))||!!(s.item?.face_web_path||s.item?.face_original_path);
  }
  async function ensureReady(){
    if(state.ready)return state;
    if(state.promise)return state.promise;
    state.promise=(async()=>{
      const {data:master,source}=await readWithFallback('referees_master.json',{requireMaster:true});
      state.master=master;state.source=source;
      buildIndexes();
      const [manifestOut,faceOut]=await Promise.all([
        readWithFallback('manifest.json').catch(()=>({data:null,source})),
        readWithFallback('faces/rutas_imagenes_referees.json').catch(()=>({data:[],source:''}))
      ]);
      state.manifest=manifestOut.data||null;
      state.faceSource=faceOut.source||source;
      buildFaceIndex(faceOut.data);
      state.ready=true;state.error=null;
      console.info('[INCA REFEREES V1.037 · V9.3]',info());
      window.dispatchEvent(new CustomEvent('inca:referees-ready',{detail:info()}));
      return state;
    })().catch(e=>{state.error=e;state.promise=null;throw e;});
    return state.promise;
  }
  function all(){return [...(state.master?.referees||[])];}
  function forLeague(compId){
    const id=asId(compId);if(!id)return [];
    return [...(state.byCompetition.get(id)||[])].sort((a,b)=>Number(b.match_count||0)-Number(a.match_count||0)||String(a.name||'').localeCompare(String(b.name||''),'es'));
  }
  function findById(id){return state.byId.get(asId(id))||null;}
  function scoreName(q,r){
    if(!q||!r)return -1;
    const n=r.nk;
    if(n===q)return 10000;
    if(n.startsWith(q))return 8000-Math.abs(n.length-q.length);
    if(n.includes(q))return 6500-Math.abs(n.length-q.length);
    if(q.includes(n)&&n.length>=5)return 6000-Math.abs(n.length-q.length);
    const qp=q.split(' ').filter(x=>x.length>1);
    if(qp.length>=2&&qp.every(p=>n.includes(p)))return 5000+qp.length*20;
    const overlap=qp.filter(p=>r.toks.includes(p)).length;
    return overlap>=2?3000+overlap*100:-1;
  }
  function findByName(name){
    const q=norm(name);if(!q)return null;
    const exact=state.byName.get(q);if(exact)return exact;
    const ranked=state.searchRows.map(r=>({r,s:scoreName(q,r)})).filter(x=>x.s>=0).sort((a,b)=>b.s-a.s||b.r.matches-a.r.matches);
    if(!ranked.length)return null;
    if(ranked.length>1&&ranked[0].s===ranked[1].s&&ranked[0].s<6500)return null;
    return ranked[0].r.item;
  }
  function search(query,{leagueId=0,country='',minMatches=0}={}){
    const q=norm(query),ct=norm(country),lid=asId(leagueId),min=Number(minMatches||0);
    let rows=state.searchRows;
    if(lid){const allow=new Set((state.byCompetition.get(lid)||[]).map(x=>asId(x.referee_id||x.id)));rows=rows.filter(x=>allow.has(asId(x.item.referee_id||x.item.id)));}
    if(ct)rows=rows.filter(x=>norm(x.item.country)===ct);
    if(min>0)rows=rows.filter(x=>x.matches>=min);
    if(!q)return rows.slice().sort((a,b)=>b.matches-a.matches||b.last.localeCompare(a.last)).map(x=>x.item);
    return rows.map(r=>({r,s:scoreName(q,r)})).filter(x=>x.s>=0).sort((a,b)=>b.s-a.s||Number(b.r.hasFace)-Number(a.r.hasFace)||b.r.matches-a.r.matches||b.r.last.localeCompare(a.r.last)).map(x=>x.r.item);
  }
  function countries(){return [...new Set(all().map(r=>String(r.country||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));}
  async function history(ref){
    await ensureReady();
    const item=typeof ref==='object'?ref:(Number(ref)?findById(ref):findByName(ref));if(!item)return [];
    const id=asId(item.referee_id||item.id);if(!id)return [];
    if(state.history.has(id))return state.history.get(id);
    const p=(async()=>{
      const {data}=await readWithFallback(`by_referee/${id}.json`);
      const rows=Array.isArray(data?.matches)?data.matches:(Array.isArray(data?.events)?data.events:[]);
      return rows.slice().sort((a,b)=>String(b.date_iso||b.date||'').localeCompare(String(a.date_iso||a.date||''))||Number(b.event_id||0)-Number(a.event_id||0));
    })().catch(e=>{console.warn('[INCA REFEREES] history failed',id,e);return [];});
    state.history.set(id,p);return p;
  }
  function faceEntry(ref){
    const item=typeof ref==='object'?ref:(Number(ref)?findById(ref):findByName(ref));
    const id=asId(item?.referee_id||item?.id||ref);return id?state.faces.get(id)||null:null;
  }
  function resolveAsset(path,source){
    path=String(path||'').trim().replace(/^\.\//,'');if(!path)return '';
    if(/^https?:\/\//i.test(path))return path;
    const base=source==='GITHUB'?REMOTE:LOCAL;
    return `${base}${path}${path.includes('?')?'&':'?'}inca=${VERSION}`;
  }
  function faceUrl(ref){
    const item=typeof ref==='object'?ref:(Number(ref)?findById(ref):findByName(ref));
    const id=asId(item?.referee_id||item?.id||ref);if(!id)return '';
    const row=state.faces.get(id)||{};
    const preferred=row.web_path||row.ruta_web||item?.face_web_path||row.path||row.ruta_original||item?.face_original_path||'';
    return resolveAsset(preferred,state.faceSource||state.source);
  }
  function hasFace(ref){
    const item=typeof ref==='object'?ref:(Number(ref)?findById(ref):findByName(ref));
    const id=asId(item?.referee_id||item?.id||ref);return !!(id&&(state.faces.has(id)||item?.face_web_path||item?.face_original_path));
  }
  function info(){
    const m=state.master||{},mf=state.manifest||{};
    return {
      ready:state.ready,source:state.source,faceSource:state.faceSource,schema:m.schema_version||'',count:all().length,
      faces:state.faces.size,matches:Number(m.match_count||mf.match_count||0),competitions:Number(m.competition_count||mf.competition_count||0),
      generatedAt:m.generated_at||mf.generated_at||'',dateRange:m.date_range||null,temporalPolicy:m.temporal_policy||null,
      bookingPolicy:m.booking_points_policy||mf.booking_points_policy||null,error:state.error?.message||''
    };
  }
  window.INCA_REFEREES=Object.freeze({ensureReady,all,forLeague,findByName,findById,search,countries,history,faceEntry,faceUrl,hasFace,info});
})();
