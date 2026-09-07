(() => {
  'use strict';

  // INCA PLAYERS V1.042 · PLAYER DATA HUB · MASTER 2025+ + CURRENT DELTA
  // BASELINE = TITAN_PLAYERS_MASTER_2025_PLUS (56 ZIP · 01/01/2025+)
  // OVERLAY = TITAN_PLAYERS_CURRENT (DELTA/BAT reciente; siempre gana por Event_ID + Player_ID)
  const TITAN_REPO='https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/';
  const CURRENT_REMOTE=TITAN_REPO+'TITAN_PLAYERS_CURRENT/';
  const CURRENT_LOCAL='./data/player-current/';
  // V1.041 · MASTER 2025+ es la única base histórica de jugador. CURRENT solo superpone datos más nuevos.
  const HIST_MASTER_REMOTE=TITAN_REPO+'TITAN_PLAYERS_MASTER_2025_PLUS/';
  const HIST_MASTER_LOCAL='./data/player-master-2025/';
  const FACES_REMOTE=TITAN_REPO+'TITAN_PLAYERS_FACES_CURRENT/web_1024/';
  const FACES_LOCAL='./data/player-faces/web_1024/';
  // V1.041 · faces nuevas de GitHub siempre primero; token de 5 min evita quedarse con una versión vieja tras el BAT.
  const FACE_REV=String(Math.floor(Date.now()/300000));

  const state={
    historyReady:false,historyPromise:null,historyRows:[],historyManifest:null,historySource:'',
    historyFullByPlayer:new Map(),historyFullPromises:new Map(),
    currentReady:false,currentPromise:null,currentRows:[],currentManifest:null,currentSource:'',
    error:null,
    currentByLeague:new Map(),currentByPlayer:new Map(),currentDirectoryByLeague:new Map(),currentDirectoryByTeam:new Map(),
    historyByLeague:new Map(),historyByPlayer:new Map()
  };

  const n=v=>{const x=Number(String(v??'').replace(',','.'));return Number.isFinite(x)?x:0;};
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toLowerCase();
  const avg=vals=>vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;
  function dateMs(v,ts){
    const t=Number(ts);if(Number.isFinite(t)&&t>0)return t>1e12?t:t*1000;
    const s=String(v||'').trim(),m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(m)return Date.UTC(Number(m[3]),Number(m[2])-1,Number(m[1]));
    const d=new Date(s);return Number.isNaN(d.getTime())?0:d.getTime();
  }
  function condition(row){const c=String(row.Condicion||'').toLowerCase();return c.includes('local')?'home':c.includes('visit')?'away':'all';}
  function rivalFrom(row){
    if(row.Rival)return row.Rival;
    const parts=String(row.Partido||'').split(/\s+vs\s+/i);if(parts.length!==2)return '';
    return condition(row)==='home'?parts[1]:parts[0];
  }
  async function fetchJSON(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP_${r.status}`);return r.json();}
  async function fetchText(url){const r=await fetch(url,{cache:'no-store',headers:{Accept:'text/csv,text/plain,*/*'}});if(!r.ok)throw new Error(`HTTP_${r.status}`);return r.text();}
  function parseCsv(text){
    if(typeof Papa==='undefined')throw new Error('Papa Parse no disponible');
    return (Papa.parse(text,{header:true,skipEmptyLines:'greedy'}).data||[]).filter(r=>r&&Object.values(r).some(v=>String(v??'').trim()));
  }

  function normalizeCurrentRow(r){
    const y=n(r.Tarjetas_Amarillas),red=n(r.Tarjetas_Rojas);
    return {
      ...r,
      ID_Jugador:Number(r.Player_ID)||0,
      Player_ID:Number(r.Player_ID)||0,
      Team_ID:Number(r.Team_ID)||0,
      Competition_ID:Number(r.Competition_ID)||0,
      Season_ID:Number(r.Season_ID)||0,
      Event_ID:String(r.Event_ID||''),
      Season:r.Season_Label||r.Temporada||'',
      Torneo:r.Liga||'',
      Rival:rivalFrom(r),
      Es_Titular:String(r.Titular)==='1'?'SI':'NO',
      Es_Suplente:String(r.Titular)==='1'?'NO':'SI',
      Estado_Inicial:String(r.Titular)==='1'?'TITULAR':'SUPLENTE',
      Entradas_Tackles:r['Entradas(Tackles)']??r.Entradas_Tackles??0,
      Atajadas:r['Atajadas(Portero)']??r.Atajadas??0,
      Tarjetas:y+red,
      __sourceKind:'CURRENT',
      __dateMs:dateMs(r.Fecha,r.Start_Timestamp)
    };
  }
  function rowsFromPacked(pack){
    const fields=Array.isArray(pack?.fields)?pack.fields:[];if(!fields.length||!Array.isArray(pack?.rows))return[];
    return pack.rows.map(a=>{const o={};for(let i=0;i<fields.length;i++)o[fields[i]]=a[i]??'';o.__sourceKind='HISTORY';o.__dateMs=dateMs(o.Fecha);o.Es_Titular=o.Es_Titular||'';o.Es_Suplente=o.Es_Suplente||'';o.Estado_Inicial=o.Estado_Inicial||'';return o;})
      .filter(r=>Number(r.ID_Jugador)>0&&String(r.Event_ID||'').trim());
  }

  async function loadCurrentLocal(){
    const m=await fetchJSON(CURRENT_LOCAL+'manifest.json?v=1.016');
    const t=await fetchText(CURRENT_LOCAL+'PLAYER_MATCH_STATS_CURRENT_EXTENDED.csv?v=1.016');
    return [m,t,'LOCAL · TITAN_PLAYERS_CURRENT'];
  }
  async function loadCurrentRemote(){
    const m=await fetchJSON(CURRENT_REMOTE+'manifest.json?inca=v1.016');
    const rev=encodeURIComponent(m?.generated_at||m?.generated_utc||Date.now());
    const t=await fetchText(CURRENT_REMOTE+'MASTER/PLAYER_MATCH_STATS_CURRENT_EXTENDED.csv?rev='+rev);
    return [m,t,'GITHUB · TITAN_PLAYERS_CURRENT'];
  }
  function pushMapList(map,key,row){
    if(!map.has(key))map.set(key,[]);
    map.get(key).push(row);
  }
  function rebuildCurrentIndexes(rows){
    const byLeague=new Map(),byPlayer=new Map(),dirLeagueMaps=new Map(),dirTeamMaps=new Map();
    for(const r of rows){
      const cid=Number(r.Competition_ID)||0,pid=Number(r.ID_Jugador)||0,teamKey=norm(r.Equipo),teamId=Number(r.Team_ID)||0;
      if(cid)pushMapList(byLeague,cid,r);
      if(pid)pushMapList(byPlayer,pid,r);
      if(!cid||!pid)continue;
      if(!dirLeagueMaps.has(cid))dirLeagueMaps.set(cid,new Map());
      const lm=dirLeagueMaps.get(cid),old=lm.get(pid);
      if(!old){lm.set(pid,{id:pid,name:r.Jugador||`Jugador ${pid}`,team:r.Equipo||'',teamId,position:r.Posicion||'',latestDate:r.Fecha||'',latestCompetition:r.Liga||'',__dateMs:r.__dateMs,matches:1});}
      else{old.matches++;if(r.__dateMs>old.__dateMs){old.name=r.Jugador||old.name;old.team=r.Equipo||old.team;old.teamId=teamId||old.teamId;old.position=r.Posicion||old.position;old.latestDate=r.Fecha||old.latestDate;old.latestCompetition=r.Liga||old.latestCompetition;old.__dateMs=r.__dateMs;}}
      if(teamKey){
        if(!dirTeamMaps.has(teamKey))dirTeamMaps.set(teamKey,new Map());
        const tm=dirTeamMaps.get(teamKey),to=tm.get(pid);
        if(!to){tm.set(pid,{id:pid,name:r.Jugador||`Jugador ${pid}`,team:r.Equipo||'',teamId,position:r.Posicion||'',latestDate:r.Fecha||'',latestCompetition:r.Liga||'',__dateMs:r.__dateMs,matches:1});}
        else{to.matches++;if(r.__dateMs>to.__dateMs){to.name=r.Jugador||to.name;to.team=r.Equipo||to.team;to.teamId=teamId||to.teamId;to.position=r.Posicion||to.position;to.latestDate=r.Fecha||to.latestDate;to.latestCompetition=r.Liga||to.latestCompetition;to.__dateMs=r.__dateMs;}}
      }
    }
    for(const arr of byLeague.values())arr.sort((a,b)=>b.__dateMs-a.__dateMs);
    for(const arr of byPlayer.values())arr.sort((a,b)=>b.__dateMs-a.__dateMs);
    state.currentByLeague=byLeague;state.currentByPlayer=byPlayer;
    state.currentDirectoryByLeague=new Map([...dirLeagueMaps].map(([cid,m])=>[cid,[...m.values()].sort((a,b)=>String(a.team).localeCompare(String(b.team),'es')||String(a.name).localeCompare(String(b.name),'es'))]));
    state.currentDirectoryByTeam=new Map([...dirTeamMaps].map(([team,m])=>[team,[...m.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'es'))]));
  }
  function rebuildHistoryIndexes(rows){
    const byLeague=new Map(),byPlayer=new Map();
    for(const r of rows){const cid=Number(r.Competition_ID)||0,pid=Number(r.ID_Jugador)||0;if(cid)pushMapList(byLeague,cid,r);if(pid)pushMapList(byPlayer,pid,r);}
    for(const arr of byLeague.values())arr.sort((a,b)=>b.__dateMs-a.__dateMs);
    for(const arr of byPlayer.values())arr.sort((a,b)=>b.__dateMs-a.__dateMs);
    state.historyByLeague=byLeague;state.historyByPlayer=byPlayer;
  }
  function applyCurrentDataset(manifest,text,source){
    const rows=parseCsv(text).map(normalizeCurrentRow).filter(r=>r.ID_Jugador&&r.Event_ID&&r.Competition_ID);
    if(!rows.length)throw new Error('CURRENT_PLAYER_DATA_EMPTY');
    rebuildCurrentIndexes(rows);
    state.currentManifest=manifest;state.currentRows=rows;state.currentSource=source;state.currentReady=true;state.error=null;
    console.info('[INCA PLAYERS V1.042] campaña actual indexada',{rows:rows.length,competitions:state.currentByLeague.size,players:state.currentByPlayer.size,source,revision:manifest?.generated_at||manifest?.generated_utc||''});
    window.dispatchEvent(new CustomEvent('inca:players-current-ready',{detail:{rows:rows.length,competitions:state.currentByLeague.size}}));
    return state;
  }
  function withTimeout(promise,ms){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('CURRENT_REFRESH_TIMEOUT')),Math.max(1000,Number(ms)||4500));
      Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)});
    });
  }

  async function ensureCurrentReady(){
    if(state.currentReady)return state;if(state.currentPromise)return state.currentPromise;
    state.currentPromise=(async()=>{
      let manifest,text,source;
      const localHost=/^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
      try{
        [manifest,text,source]=localHost?await loadCurrentLocal():await loadCurrentRemote();
      }catch(primaryErr){
        [manifest,text,source]=localHost?await loadCurrentRemote():await loadCurrentLocal();
      }
      return applyCurrentDataset(manifest,text,source);
    })().catch(e=>{state.error=e;state.currentPromise=null;throw e;});
    return state.currentPromise;
  }

  async function refreshCurrentReady({timeoutMs=4500}={}){
    // Refresca desde el repo actualizado por BAT. Si falla, conserva el snapshot ya cargado.
    if(!state.currentReady){ try{ await ensureCurrentReady(); }catch(_){} }
    try{
      const [manifest,text,source]=await withTimeout(loadCurrentRemote(),timeoutMs);
      const remoteTs=Date.parse(manifest?.generated_at||manifest?.generated_utc||0)||0;
      const localTs=Date.parse(state.currentManifest?.generated_at||state.currentManifest?.generated_utc||0)||0;
      if(!state.currentReady || remoteTs>=localTs) applyCurrentDataset(manifest,text,source);
    }catch(error){
      if(!state.currentReady) throw error;
      console.warn('[INCA PLAYERS V1.042] refresh remoto no disponible; se conserva CURRENT cargado.',error?.message||error);
    }
    return state;
  }

  async function ensureReady(){
    if(state.historyReady)return state;if(state.historyPromise)return state.historyPromise;
    state.historyPromise=(async()=>{
      let mf=null,packed=null,source='';
      // V1.041: no existe fallback histórico legado. El MASTER 2025+ es la base oficial.
      try{mf=await fetchJSON(HIST_MASTER_LOCAL+'manifest.json?v=1.041');}
      catch(_){mf=await fetchJSON(HIST_MASTER_REMOTE+'manifest.json?inca=v1.041');}
      try{packed=await fetchJSON(HIST_MASTER_LOCAL+'RECENT/recent20.json?v=1.041');source='LOCAL · PLAYER MASTER 2025+ · 56 ZIP';}
      catch(_){const rev=encodeURIComponent(mf?.generated_at||'v1.041');packed=await fetchJSON(HIST_MASTER_REMOTE+'RECENT/recent20.json?rev='+rev);source='GITHUB · PLAYER MASTER 2025+ · 56 ZIP';}
      state.historyManifest=mf;state.historyRows=rowsFromPacked(packed);
      if(!state.historyRows.length)throw new Error('PLAYER_MASTER_2025_PLUS_REQUIRED');
      rebuildHistoryIndexes(state.historyRows);state.historyReady=true;state.historySource=source;state.error=null;
      console.info('[INCA PLAYERS V1.042] PLAYER DATA HUB listo',{rows:state.historyRows.length,players:state.historyByPlayer.size,source,masterRows:state.historyManifest?.counts?.final_rows||0,currentOverlay:state.currentRows.length});
      window.dispatchEvent(new CustomEvent('inca:players-master-ready',{detail:{rows:state.historyRows.length,players:state.historyByPlayer.size}}));
      return state;
    })().catch(e=>{state.error=e;state.historyPromise=null;throw e;});
    return state.historyPromise;
  }

  async function loadFullHistoryForPlayer(playerId){
    const id=Number(playerId)||0;if(!id)return [];
    if(state.historyFullByPlayer.has(id))return state.historyFullByPlayer.get(id);
    if(state.historyFullPromises.has(id))return state.historyFullPromises.get(id);
    const promise=(async()=>{
      await ensureReady();
      const meta=(state.historyManifest?.players||[]).find(p=>Number(p.id)===id);
      if(!meta?.file)return state.historyByPlayer.get(id)||[];
      let pack=null;const rel=String(meta.file).replace(/^\/+/, '');
      try{pack=await fetchJSON(HIST_MASTER_LOCAL+rel+'?v=1.041');}
      catch(_){try{pack=await fetchJSON(HIST_MASTER_REMOTE+rel+'?rev='+encodeURIComponent(state.historyManifest?.generated_at||'v1.041'));}
      catch(error){console.warn('[INCA PLAYERS V1.042] full history no disponible para',id,error?.message||error);return state.historyByPlayer.get(id)||[];}}
      const rows=rowsFromPacked(pack).sort((a,b)=>b.__dateMs-a.__dateMs);
      state.historyFullByPlayer.set(id,rows);return rows;
    })().finally(()=>state.historyFullPromises.delete(id));
    state.historyFullPromises.set(id,promise);return promise;
  }

  async function rowsForPlayerFull(playerId,compId=null){
    const id=Number(playerId)||0,c=Number(compId||0);const hist=await loadFullHistoryForPlayer(id);
    let rows=dedupeRows([...(state.currentByPlayer.get(id)||[]),...hist]);if(c)rows=rows.filter(r=>Number(r.Competition_ID)===c);return rows;
  }

  function dedupeRows(rows){
    const m=new Map();
    for(const r of rows){const k=`${r.Event_ID}|${r.ID_Jugador||r.Player_ID}`;const old=m.get(k);if(!old||r.__sourceKind==='CURRENT')m.set(k,r);}
    return [...m.values()].sort((a,b)=>b.__dateMs-a.__dateMs);
  }
  function allRows(){return dedupeRows([...state.currentRows,...state.historyRows]);}
  function rowsForLeague(compId,seasonId=null){
    const c=Number(compId),s=Number(seasonId||0);let rows=dedupeRows([...(state.currentByLeague.get(c)||[]),...(state.historyByLeague.get(c)||[])]);if(s)rows=rows.filter(r=>Number(r.Season_ID)===s);return rows;
  }
  function currentRowsForLeague(compId,seasonId=null){
    const c=Number(compId),s=Number(seasonId||0);let rows=state.currentByLeague.get(c)||[];if(s)rows=rows.filter(r=>Number(r.Season_ID)===s);return rows;
  }
  function rowsForSelectedSeason(compId,seasonId){
    const current=currentRowsForLeague(compId,seasonId);if(current.length)return current;
    const c=Number(compId),s=Number(seasonId||0);let rows=state.historyByLeague.get(c)||[];if(s)rows=rows.filter(r=>Number(r.Season_ID)===s);return rows;
  }
  function rowsForPlayer(playerId,compId=null){
    const id=Number(playerId),c=Number(compId||0),hist=state.historyFullByPlayer.get(id)||state.historyByPlayer.get(id)||[];let rows=dedupeRows([...(state.currentByPlayer.get(id)||[]),...hist]);if(c)rows=rows.filter(r=>Number(r.Competition_ID)===c);return rows;
  }
  function currentSeasonIdForLeague(compId){
    const rows=currentRowsForLeague(compId);if(!rows.length)return 0;
    const counts=new Map();for(const r of rows){const id=Number(r.Season_ID);if(id)counts.set(id,(counts.get(id)||0)+1);}
    return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||0;
  }
  function currentSeasonLabelForLeague(compId){
    const sid=currentSeasonIdForLeague(compId);return currentRowsForLeague(compId,sid)[0]?.Season_Label||currentRowsForLeague(compId,sid)[0]?.Temporada||'';
  }

  function directoryForLeague(compId){
    return state.currentDirectoryByLeague.get(Number(compId))||[];
  }
  function directoryForTeams(teamNames=[]){
    const wanted=[...(teamNames||[])].map(norm).filter(Boolean),m=new Map();
    for(const teamKey of wanted){for(const p of state.currentDirectoryByTeam.get(teamKey)||[]){const old=m.get(p.id);if(!old||p.__dateMs>old.__dateMs)m.set(p.id,{...p});}}
    const wantedSet=new Set(wanted),players=state.historyManifest?.players||[];
    for(const p of players){if(!wantedSet.has(norm(p.primary_team)))continue;const id=Number(p.id);if(!id||m.has(id))continue;m.set(id,{id,name:p.name||`Jugador ${id}`,team:p.primary_team||'',teamId:Number(p.primary_team_id)||0,position:p.position||'',latestDate:'',latestCompetition:'',matches:Number(p.matches)||0});}
    return [...m.values()].sort((a,b)=>String(a.team).localeCompare(String(b.team),'es')||String(a.name).localeCompare(String(b.name),'es'));
  }


  function faceCandidates(playerId,photo=''){
    const id=Number(playerId)||0;if(!id)return photo?[photo]:[];
    // ORDEN V1.041: FACE CURRENT (BAT/GitHub) > snapshot local nuevo > face vieja de la app > foto histórica/API.
    const out=[FACES_REMOTE+id+'.webp?faces='+FACE_REV,FACES_LOCAL+id+'.webp',`./img/${id}.png`];
    if(photo)out.push(String(photo));
    out.push(`https://api.sofascore.com/api/v1/player/${id}/image`);
    return [...new Set(out.filter(Boolean))];
  }
  function faceUrl(playerId){
    const id=Number(playerId)||0;if(!id)return '';
    return FACES_REMOTE+id+'.webp?faces='+FACE_REV;
  }

  const METRICS=Object.freeze({
    goals:{label:'Goles',value:r=>n(r.Goles)},assists:{label:'Asistencias',value:r=>n(r.Asistencias)},
    involvements:{label:'Goles + asistencias',value:r=>n(r.Goles)+n(r.Asistencias)},cards:{label:'Tarjetas',value:r=>n(r.Tarjetas)},
    shots:{label:'Tiros',value:r=>n(r.Tiros_Totales)},sot:{label:'Tiros a puerta',value:r=>n(r.Tiros_Al_Arco)},
    fouls:{label:'Faltas cometidas',value:r=>n(r.Faltas_Cometidas)},fouled:{label:'Faltas recibidas',value:r=>n(r.Faltas_Recibidas)},
    tackles:{label:'Tackles',value:r=>n(r.Entradas_Tackles)},offsides:{label:'Offsides',value:r=>n(r.Offsides)},rating:{label:'Rating',value:r=>n(r.Rating)}
  });
  const STREAK_MARKETS=Object.freeze({
    involvement:{label:'Gol o asistencia',test:r=>n(r.Goles)+n(r.Asistencias)>=1,value:r=>n(r.Goles)+n(r.Asistencias)},
    goal:{label:'1+ gol',test:r=>n(r.Goles)>=1,value:r=>n(r.Goles)},assist:{label:'1+ asistencia',test:r=>n(r.Asistencias)>=1,value:r=>n(r.Asistencias)},
    sot:{label:'1+ tiro a puerta',test:r=>n(r.Tiros_Al_Arco)>=1,value:r=>n(r.Tiros_Al_Arco)},sot2:{label:'2+ tiros a puerta',test:r=>n(r.Tiros_Al_Arco)>=2,value:r=>n(r.Tiros_Al_Arco)},
    shots2:{label:'2+ tiros',test:r=>n(r.Tiros_Totales)>=2,value:r=>n(r.Tiros_Totales)},shots3:{label:'3+ tiros',test:r=>n(r.Tiros_Totales)>=3,value:r=>n(r.Tiros_Totales)},
    card:{label:'1+ tarjeta',test:r=>n(r.Tarjetas)>=1,value:r=>n(r.Tarjetas)},foul:{label:'1+ falta cometida',test:r=>n(r.Faltas_Cometidas)>=1,value:r=>n(r.Faltas_Cometidas)},
    fouls2:{label:'2+ faltas cometidas',test:r=>n(r.Faltas_Cometidas)>=2,value:r=>n(r.Faltas_Cometidas)},fouled:{label:'1+ falta recibida',test:r=>n(r.Faltas_Recibidas)>=1,value:r=>n(r.Faltas_Recibidas)},
    fouled2:{label:'2+ faltas recibidas',test:r=>n(r.Faltas_Recibidas)>=2,value:r=>n(r.Faltas_Recibidas)},tackle:{label:'1+ tackle',test:r=>n(r.Entradas_Tackles)>=1,value:r=>n(r.Entradas_Tackles)},
    tackles2:{label:'2+ tackles',test:r=>n(r.Entradas_Tackles)>=2,value:r=>n(r.Entradas_Tackles)},offside:{label:'1+ offside',test:r=>n(r.Offsides)>=1,value:r=>n(r.Offsides)}
  });

  function groupPlayers(rows,scope='all'){
    const map=new Map();
    for(const r of rows){if(scope!=='all'&&condition(r)!==scope)continue;const id=Number(r.ID_Jugador);if(!id)continue;if(!map.has(id))map.set(id,{id,name:r.Jugador||`Jugador ${id}`,team:r.Equipo||'',teamId:Number(r.Team_ID)||0,position:r.Posicion||'',rows:[]});map.get(id).rows.push(r);}
    for(const p of map.values()){p.rows.sort((a,b)=>b.__dateMs-a.__dateMs);const latest=p.rows[0];if(latest){p.name=latest.Jugador||p.name;p.team=latest.Equipo||p.team;p.teamId=Number(latest.Team_ID)||p.teamId;p.position=latest.Posicion||p.position;}}
    return [...map.values()];
  }
  function summarize(p,def){
    const mins=p.rows.reduce((s,r)=>s+n(r.Minutos_Jugados),0),total=p.rows.reduce((s,r)=>s+def.value(r),0),starts=p.rows.reduce((s,r)=>s+(String(r.Es_Titular||'').toUpperCase()==='SI'||String(r.Titular)==='1'?1:0),0);
    return {...p,apps:p.rows.length,starts,minutes:mins,total,per90:mins>0?total*90/mins:0,rating:avg(p.rows.map(r=>n(r.Rating)).filter(x=>x>0))};
  }
  function playerCurrentStats(playerId,compId,seasonId,scope='all',metric='goals'){
    const def=METRICS[metric]||METRICS.goals;let rows=rowsForPlayer(playerId,compId);if(seasonId)rows=rows.filter(r=>Number(r.Season_ID)===Number(seasonId));if(scope!=='all')rows=rows.filter(r=>condition(r)===scope);return summarize({id:Number(playerId),rows},def);
  }
  function topPlayers(compId,{seasonId=null,metric='goals',scope='all',limit=30,minMinutes=1}={}){
    const def=METRICS[metric]||METRICS.goals;return groupPlayers(rowsForSelectedSeason(compId,seasonId),scope).map(p=>summarize(p,def)).filter(p=>p.minutes>=minMinutes).sort((a,b)=>b.total-a.total||b.per90-a.per90||b.minutes-a.minutes).slice(0,limit);
  }
  function playerStreaks(compId,{seasonId=null,market='involvement',scope='all',min=3,limit=40}={}){
    const mk=STREAK_MARKETS[market]||STREAK_MARKETS.involvement,out=[];const base=rowsForLeague(compId,seasonId);
    for(const p of groupPlayers(base,scope)){let streak=0;for(const r of p.rows){if(mk.test(r))streak++;else break;}if(streak>=min){const sample=p.rows.slice(0,Math.max(5,streak));out.push({...p,streak,market,marketLabel:mk.label,latest:sample[0]||null,sequence:sample.slice(0,5).map(r=>mk.value(r))});}}
    return out.sort((a,b)=>b.streak-a.streak||String(a.name).localeCompare(String(b.name),'es')).slice(0,limit);
  }
  function playerStreaksForIds(playerIds,{market='involvement',scope='all',min=3,limit=60,competitionId=null}={}){
    const ids=new Set((playerIds||[]).map(Number).filter(Boolean));if(!ids.size)return[];const mk=STREAK_MARKETS[market]||STREAK_MARKETS.involvement;let base=dedupeRows([...ids].flatMap(id=>rowsForPlayer(id)));if(competitionId)base=base.filter(r=>Number(r.Competition_ID)===Number(competitionId));const out=[];
    for(const p of groupPlayers(base,scope)){let streak=0;for(const r of p.rows){if(mk.test(r))streak++;else break;}if(streak>=min){const sample=p.rows.slice(0,Math.max(5,streak));out.push({...p,streak,market,marketLabel:mk.label,latest:sample[0]||null,sequence:sample.slice(0,5).map(r=>mk.value(r))});}}
    return out.sort((a,b)=>b.streak-a.streak||String(a.name).localeCompare(String(b.name),'es')).slice(0,limit);
  }
  function info(){return {version:'1.042',contract:'MASTER_2025_PLUS + CURRENT_DELTA',historyReady:state.historyReady,currentReady:state.currentReady,currentRows:state.currentRows.length,historicalRows:state.historyRows.length,masterRows:Number(state.historyManifest?.counts?.final_rows)||0,currentRevision:state.currentManifest?.generated_at||'',source:state.currentSource,historySource:state.historySource,error:state.error?.message||''};}

  window.INCA_PLAYERS=Object.freeze({ensureReady,ensureCurrentReady,refreshCurrentReady,loadFullHistoryForPlayer,rowsForPlayerFull,allRows,rowsForLeague,currentRowsForLeague,rowsForSelectedSeason,rowsForPlayer,currentSeasonIdForLeague,currentSeasonLabelForLeague,directoryForLeague,directoryForTeams,playerCurrentStats,topPlayers,playerStreaks,playerStreaksForIds,faceUrl,faceCandidates,METRICS,STREAK_MARKETS,info,condition});
})();
