/*
 * INCASTATS · EXTRACTOR ÚNICO SOFA / UNIFICADOR DE STATS V4.0
 * EJECUCIÓN: pegar este archivo en la consola (F12) de https://www.sofascore.com/football
 * ORIGEN: masters de equipos / jugadores / árbitros + encuentros del propio SofaScore.
 * SIN servicios de pago, sin llaves, sin interceptar fetch y sin librerías externas.
 * IMPORTANTE: endpoints de terceros pueden cambiar, responder 403/429 o limitar acceso.
 * No elude sus restricciones; 403 detiene inmediatamente, 429 aplica backoff y parada segura.
 */
(function (root) {
'use strict';
const VERSION='4.0.0_UNIFICADOR_MASTERS_CHECKPOINT';
const SCHEMA='incastats.unified.stats.v4';
const DB_NAME='incastats_sofa_unificador_v4';
const DB_VERSION=1;
const API='/api/v1';
const MAX_DAYS=120;
const MAX_PAGES=90;
const SPEED_GAP={1:1600,2:1250,3:1050,4:900,5:800,6:700};
const STOP_ERRORS=new Set(['PAUSA_SEGURA_403','PAUSA_SEGURA_429','PAUSADO_POR_USUARIO','LIMITE_SOLICITUDES']);
const METRICS=['Goals','Ball possession','Expected goals','Big chances','Total shots','Goalkeeper saves','Corner kicks','Fouls','Passes','Tackles','Free kicks','Yellow cards','Red cards','Shots on target','Hit woodwork','Shots off target','Blocked shots','Shots inside box','Shots outside box','Big chances scored','Big chances missed','Through balls','Touches in penalty area','Fouled in final third','Offsides','Accurate passes','Throw-ins','Final third entries','Final third phase','Long balls','Crosses','Duels','Dispossessed','Ground duels','Aerial duels','Dribbles','Tackles won','Total tackles','Interceptions','Recoveries','Clearances','Errors lead to a shot','Total saves','Goals prevented','Big saves','High claims','Punches','Goal kicks'];
const PLAYER_METRIC_MAP={minutes:['minutesPlayed'],rating:['rating'],goals:['goals'],assists:['goalAssist','assists'],xg:['expectedGoals','xg'],xa:['expectedAssists','expectedAssist','xa'],shots_on_target:['onTargetScoringAttempt','shotsOnTarget'],shots_off_target:['shotOffTarget'],shots_blocked:['blockedScoringAttempt'],hit_woodwork:['hitWoodwork'],passes:['totalPass','passes'],accurate_passes:['accuratePass','accuratePasses'],key_passes:['keyPass','keyPasses'],big_chances_created:['bigChanceCreated','bigChancesCreated'],big_chances_missed:['bigChanceMissed','bigChancesMissed'],touches:['touches'],dribbles:['successfulDribble','wonContest','accurateDribble'],tackles:['totalTackle','tackles'],interceptions:['interceptionWon','interceptions'],duels_won:['duelWon','duelsWon'],fouls_committed:['fouls'],fouls_received:['wasFouled','fouled'],saves:['saves','goalkeeperSaves'],offsides:['totalOffside','offsides']};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const nowIso=()=>new Date().toISOString();
const digits=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;};
const nonempty=v=>v!==null&&v!==undefined&&v!=='';
const fold=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const isoDate=v=>{let t=Number(v);if(Number.isFinite(t)&&t>0)return new Date(t>1e12?t:t*1000).toISOString().slice(0,10);return '';};
const isoTime=v=>{const t=Number(v);return Number.isFinite(t)&&t>0?new Date(t>1e12?t:t*1000).toISOString():null;};
function numberOrNull(v){if(!nonempty(v))return null;if(typeof v==='string'){v=v.trim().replace('%','');if(!v||!/^-?\d+(?:[.,]\d+)?$/.test(v))return null;v=v.replace(',','.');}const n=Number(v);return Number.isFinite(n)?n:null;}
function chooseMetric(source,keys){for(const k of keys)if(nonempty(source?.[k]))return numberOrNull(source[k]);return null;}
function cap(n,min,max,defaultValue){n=Number(n);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.floor(n))):defaultValue;}
function deepClone(x){return JSON.parse(JSON.stringify(x));}
function sessionKey(options){return JSON.stringify([VERSION,options.from,options.to,options.competitions.map(x=>Number(x.id)).sort((a,b)=>a-b),Boolean(options.onlyMasterTeams)]);}
function isFinished(e){return e?.status?.type==='finished'||[100,106,110,113,120].includes(e?.status?.code);}
function isExcluded(e){return /\b(friendly|friendlies|amistoso|amistosos|pre season|preseason|exhibition)\b/i.test(fold([e?.tournament?.uniqueTournament?.name,e?.tournament?.name].filter(Boolean).join(' ')));}
function mustWindow(options){
 const a=Date.parse(options.from),b=Date.parse(options.to);
 if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b||b-a>MAX_DAYS*86400000)throw Error('Ventana inválida. Elige entre 1 y 120 días, con DESDE anterior a HASTA.');
 if(!Array.isArray(options.competitions)||!options.competitions.length)throw Error('Selecciona al menos una competición.');
 return {from:a,to:b};
}
function normalizeMaster(type,raw){
 const arr=Array.isArray(raw)?raw:raw?.[type];
 if(!Array.isArray(arr))throw Error(`El archivo no tiene ${type}[]. No cambies la estructura original del master.`);
 const map=new Map(),invalid=[],duplicates=[];
 for(let i=0;i<arr.length;i++){
  const v=arr[i];const id=digits(type==='teams'?(v?.team_id??v?.id):type==='players'?(v?.id??v?.player_id??v?.Player_ID):(v?.referee_id??v?.id));
  if(!id){invalid.push(i);continue;}
  if(map.has(id)){duplicates.push(id);continue;}
  map.set(id,{...v,id,...(type==='teams'?{team_id:id}:type==='referees'?{referee_id:id}:{})});
 }
 return {type,source_schema:raw?.schema_version??raw?.schema??null,source_generated_at:raw?.generated_at??null,items:[...map.values()],invalid,duplicates};
}
function masterBundle(input){
 const bundle={teams:[],players:[],referees:[],source:{},warnings:[]};
 for(const type of ['teams','players','referees']){
  if(!input?.[type]){bundle.warnings.push('MASTER_AUSENTE_'+type.toUpperCase());continue;}
  const n=normalizeMaster(type,input[type]);bundle[type]=n.items;
  bundle.source[type]={schema:n.source_schema,generated_at:n.source_generated_at,count:n.items.length};
  if(n.invalid.length)bundle.warnings.push(type+': '+n.invalid.length+' filas sin ID válido');
  if(n.duplicates.length)bundle.warnings.push(type+': '+n.duplicates.length+' IDs duplicados omitidos');
 }
 return bundle;
}
function valOrNull(o,names){for(const n of names)if(nonempty(o?.[n]))return o[n];return null;}
function parseTeamStats(raw,e){
 const periods={};
 for(const p of raw?.statistics||[]){
  if(!p?.period)continue;
  const per=periods[p.period]??={home:{},away:{}};
  for(const metric of METRICS){per.home[metric]??=null;per.away[metric]??=null;}
  for(const group of p.groups||[])for(const item of group.statisticsItems||[]){
   if(!item?.name||!METRICS.includes(item.name))continue;
   per.home[item.name]=numberOrNull(item.home??item.homeValue);
   per.away[item.name]=numberOrNull(item.away??item.awayValue);
  }
 }
 const score=(side,period)=>{const v=side==='home'?e?.homeScore:e?.awayScore;if(!v)return null;return period==='ALL'?numberOrNull(v.display??v.current??v.normaltime):period==='1ST'?numberOrNull(v.period1):numberOrNull(v.period2);};
 for(const period of ['ALL','1ST','2ND'])if(periods[period]){
  periods[period].home.Goals=score('home',period)??periods[period].home.Goals;
  periods[period].away.Goals=score('away',period)??periods[period].away.Goals;
 }
 return periods;
}
function parseCards(raw,e){
 const cards=[],seen=new Set();
 for(const inc of raw?.incidents||[]){
  if(inc?.incidentType!=='card')continue;
  const cls=inc.incidentClass??inc.cardType??'unknown';
  const id=inc.id??inc.incidentId??null;
  const pid=digits(inc.player?.id), minute=numberOrNull(inc.time),added=numberOrNull(inc.addedTime);
  const typ=String(cls).toLowerCase(),key=id?`id:${id}`:`${pid}|${minute}|${added}|${typ}|${inc.isHome}`;
  if(seen.has(key))continue;seen.add(key);
  cards.push({event_id:digits(e?.id),provider_incident_id:id,player_id:pid,player_name:inc.player?.name??null,team_id:digits(typeof inc.isHome==='boolean'?(inc.isHome?e?.homeTeam?.id:e?.awayTeam?.id):inc.team?.id),minute,added_time:added,card_type:typ==='yellowred'?'SECOND_YELLOW_RED':typ==='red'?'DIRECT_RED':typ==='yellow'?'YELLOW':'UNKNOWN',yellow_event:typ==='yellow'||typ==='yellowred'?1:0,effective_red:typ==='yellowred'||typ==='red'?1:0,source:'sofascore_incidents'});
 }
 return cards;
}
function lineupArray(side){return Array.isArray(side)?side:Array.isArray(side?.players)?side.players:[];}
function parsePlayers(raw,e,cardRows,cardsKnown=false){
 const out=[],seen=new Set(),cm=new Map();
 for(const c of cardRows){if(!c.player_id)continue;let v=cm.get(c.player_id);if(!v){v={yellow:0,red:0};cm.set(c.player_id,v);}v.yellow+=c.yellow_event;v.red+=c.effective_red;}
 for(const side of ['home','away']){
  const team=side==='home'?e?.homeTeam:e?.awayTeam,opponent=side==='home'?e?.awayTeam:e?.homeTeam;
  for(const item of lineupArray(raw?.[side])){
   const p=item?.player??{},s=item?.statistics??null,id=digits(p.id);
   if(!id||!s||!Object.keys(s).length||seen.has(id))continue;seen.add(id);
   const metrics={};for(const [k,keys] of Object.entries(PLAYER_METRIC_MAP))metrics[k]=chooseMetric(s,keys);
   const shotParts=[metrics.shots_on_target,metrics.shots_off_target,metrics.shots_blocked];
   // Si faltan componentes no se inventa un cero para los tiros totales.
   metrics.shots_total=chooseMetric(s,['totalShots']);
   if(metrics.shots_total===null&&shotParts.every(n=>n!==null))metrics.shots_total=shotParts.reduce((a,b)=>a+b,0);
   if(metrics.minutes===null||metrics.minutes<=0)continue;
   const card=cm.get(id)||{yellow:cardsKnown?0:null,red:cardsKnown?0:null};
   out.push({event_id:digits(e.id),player_id:id,player_name:p.name??p.shortName??null,team_id:digits(team?.id),team_name:team?.name??null,opponent_id:digits(opponent?.id),condition:side==='home'?'Local':'Visita',position:p.position??item.position??null,starter:item.substitute===true?false:true,competition_id:digits(e?.tournament?.uniqueTournament?.id),season_id:digits(e?.season?.id),timestamp:e.startTimestamp??null,date:isoDate(e.startTimestamp),...metrics,yellow_cards:card.yellow,red_cards:card.red,source:'sofascore_lineups',quality:'observed'});
  }
 }
 return out;
}
function refFromEvent(e, refsById, refsByName){
 const src=Array.isArray(e?.referees)?e.referees.find(x=>x?.id||x?.name):e?.referee;
 const rawId=digits(src?.id),name=src?.name??null;
 if(rawId){return {referee_id:rawId,referee_name:name??refsById.get(rawId)?.name??null,source:'sofascore_event',verified_assignment:'listed_by_provider',master_found:refsById.has(rawId)};}
 if(name){const matches=refsByName.get(fold(name))||[];if(matches.length===1)return {referee_id:matches[0].id,referee_name:name,source:'sofascore_event_name_matched',verified_assignment:'listed_by_provider',master_found:true};return {referee_id:null,referee_name:name,source:'sofascore_event_name_only',verified_assignment:'unresolved_id',master_found:false};}
 return {referee_id:null,referee_name:null,source:null,verified_assignment:'pending',master_found:false};
}
function lastSamples(rows,values,sortField='timestamp'){
 const sorted=[...rows].filter(r=>r?.[sortField]&&r?.status!=='scheduled').sort((a,b)=>Number(b[sortField])-Number(a[sortField]));
 const out={};for(const n of [5,10,20]){
  const sample=sorted.slice(0,n),m={sample:sample.length,window:'dataset_only',as_of:sample[0]?.date??null};
  for(const [name,fn] of Object.entries(values)){
   const valid=sample.map(fn).filter(v=>typeof v==='number'&&Number.isFinite(v));
   m[name]={n:valid.length,mean:valid.length?Number((valid.reduce((a,b)=>a+b,0)/valid.length).toFixed(3)):null};
  }out['last_'+n]=m;
 }
 return out;
}
function uniqueEventRows(records){
 const keyed=new Map();const score=r=>(r.statistics?5:0)+(r.lineups?3:0)+(r.incidents?1:0)+(r.fetched?.detail?.status==='ok'?2:0);
 for(const row of records){
  const id=digits(row?.event?.id);if(!id)continue;
  const old=keyed.get(id);if(!old||score(row)>score(old)||score(row)===score(old)&&String(row.updated_at||'')>String(old.updated_at||''))keyed.set(id,row);
 }
 return [...keyed.values()];
}
function unify(records, masters, settings={}){
 const data=masterBundle(masters),teams=new Map(data.teams.map(x=>[x.id,{...x}])),players=new Map(data.players.map(x=>[x.id,{...x}])),refs=new Map(data.referees.map(x=>[x.id,{...x}]));
 const refsByName=new Map();for(const r of refs.values()){const key=fold(r.name);if(!key)continue;if(!refsByName.has(key))refsByName.set(key,[]);refsByName.get(key).push(r);}
 const matches=[],teamMatchStats=[],playerMatchStats=[],cards=[],issues=[];
 const totals={events:0,finished:0,with_team_stats:0,with_player_stats:0,with_referee:0,missing_stats:0,excluded_friendlies:0};
 const sorted=uniqueEventRows(records).sort((a,b)=>Number(a.event.startTimestamp)-Number(b.event.startTimestamp)||Number(a.event.id)-Number(b.event.id));
 const seenEvents=new Set();
 for(const row of sorted){const e=row.event,id=digits(e.id);if(!id||seenEvents.has(id))continue;seenEvents.add(id);
  if(isExcluded(e)){totals.excluded_friendlies++;continue;}
  totals.events++;const homeId=digits(e.homeTeam?.id),awayId=digits(e.awayTeam?.id),cId=digits(e.tournament?.uniqueTournament?.id)??digits(row.competition?.id),seasonId=digits(e.season?.id)??digits(row.season?.id);
  const date=isoDate(e.startTimestamp),ref=refFromEvent(e,refs,refsByName),finished=isFinished(e);
  if(finished)totals.finished++;if(ref.referee_id)totals.with_referee++;
  const match={event_id:id,provider:'sofascore',timestamp:e.startTimestamp??null,date,kickoff_utc:isoTime(e.startTimestamp),status:e.status?.type??'unknown',finished,competition_id:cId,competition_name:e.tournament?.uniqueTournament?.name??row.competition?.name??null,season_id:seasonId,season_name:e.season?.name??row.season?.name??null,round:e.roundInfo?.round??e.roundInfo?.name??null,home_team_id:homeId,home_team:e.homeTeam?.name??null,away_team_id:awayId,away_team:e.awayTeam?.name??null,home_score:numberOrNull(e.homeScore?.display??e.homeScore?.current),away_score:numberOrNull(e.awayScore?.display??e.awayScore?.current),stadium:e.venue?.name??null,venue_id:digits(e.venue?.id),neutral_venue:e?.neutralGround===true?true:e?.neutralGround===false?false:null,...ref,has_team_stats:false,has_lineups:false,has_cards:false};
  matches.push(match);
  for(const [team,side] of [[e.homeTeam,'home'],[e.awayTeam,'away']]){
   const tid=digits(team?.id);if(!tid)continue;
   if(!teams.has(tid))teams.set(tid,{id:tid,team_id:tid,name:team?.name??`Equipo ${tid}`,source:'sofascore_event_new',in_existing_inca:false});
   const entry=teams.get(tid);if(!entry.last_seen_in_extraction||entry.last_seen_in_extraction<date){entry.last_seen_in_extraction=date;entry.last_seen_event_id=id;}
  }
  if(ref.referee_id&&!refs.has(ref.referee_id))refs.set(ref.referee_id,{id:ref.referee_id,referee_id:ref.referee_id,name:ref.referee_name,source:'sofascore_event_new',match_count:0});
  const stats=finished?parseTeamStats(row.statistics,e):{};
  if(Object.keys(stats).length&&Object.keys(stats.ALL?.home??{}).some(k=>k!=='Goals'&&stats.ALL.home[k]!==null)){match.has_team_stats=true;totals.with_team_stats++;}
  else if(finished){totals.missing_stats++;issues.push({event_id:id,reason:'NO_DETAILED_TEAM_STATS'});}
  for(const [period,per] of Object.entries(stats))for(const side of ['home','away']){
   const tid=side==='home'?homeId:awayId,rid=side==='home'?awayId:homeId;
   teamMatchStats.push({event_id:id,competition_id:cId,season_id:seasonId,team_id:tid,opponent_id:rid,condition:side==='home'?'Local':'Visita',period,timestamp:e.startTimestamp,date,metrics:per[side],source:'sofascore_statistics'});
  }
  const theseCards=finished?parseCards(row.incidents,e):[];
  cards.push(...theseCards);
  match.has_cards=Array.isArray(row.incidents?.incidents);
  const pstats=finished?parsePlayers(row.lineups,e,theseCards,Array.isArray(row.incidents?.incidents)):[];
  match.has_lineups=Array.isArray(row.lineups?.home?.players)||Array.isArray(row.lineups?.away?.players);
  if(pstats.length)totals.with_player_stats++;
  playerMatchStats.push(...pstats);
  for(const p of pstats){
   if(!players.has(p.player_id))players.set(p.player_id,{id:p.player_id,name:p.player_name,team_id:String(p.team_id??''),team:p.team_name,position:p.position,photo:`https://api.sofascore.com/api/v1/player/${p.player_id}/image`,source:'sofascore_lineups_new',last_date:p.date});
   const old=players.get(p.player_id);
   // No sobrescribir team_id de un master histórico con una selección nacional/otro equipo sin verificar.
   if(!old.last_seen_in_extraction||old.last_seen_in_extraction<p.date){old.last_seen_in_extraction=p.date;old.observed_team_id=p.team_id;old.observed_team_name=p.team_name;old.observed_competition_id=cId;}
  }
 }
 const recentTeam=new Map(),recentPlayer=new Map(),recentRef=new Map();
 const allStatsByEventTeam=new Map(teamMatchStats.filter(x=>x.period==='ALL').map(x=>[`${x.event_id}|${x.team_id}`,x]));
 for(const m of matches){if(!m.finished)continue;for(const [teamId,side] of [[m.home_team_id,'Local'],[m.away_team_id,'Visita']]){if(!teamId)continue;if(!recentTeam.has(teamId))recentTeam.set(teamId,[]);const stats=allStatsByEventTeam.get(`${m.event_id}|${teamId}`);recentTeam.get(teamId).push({...m,condition:side,goals:side==='Local'?m.home_score:m.away_score,shots:stats?.metrics?.['Total shots']??null,shots_on_target:stats?.metrics?.['Shots on target']??null,corners:stats?.metrics?.['Corner kicks']??null,fouls:stats?.metrics?.Fouls??null,yellow:stats?.metrics?.['Yellow cards']??null});}
  if(m.referee_id){if(!recentRef.has(m.referee_id))recentRef.set(m.referee_id,[]);const allHome=allStatsByEventTeam.get(`${m.event_id}|${m.home_team_id}`);const allAway=allStatsByEventTeam.get(`${m.event_id}|${m.away_team_id}`);const y1=allHome?.metrics?.['Yellow cards'],y2=allAway?.metrics?.['Yellow cards'],f1=allHome?.metrics?.Fouls,f2=allAway?.metrics?.Fouls;recentRef.get(m.referee_id).push({...m,yellow:y1!==null&&y1!==undefined&&y2!==null&&y2!==undefined?y1+y2:null,fouls:f1!==null&&f1!==undefined&&f2!==null&&f2!==undefined?f1+f2:null});}
 }
 for(const p of playerMatchStats){if(!recentPlayer.has(p.player_id))recentPlayer.set(p.player_id,[]);recentPlayer.get(p.player_id).push(p);}
 const teamForm=[],playerForm=[],refereeForm=[];
 for(const [tid,rows] of recentTeam){
  const vals={goals:r=>r.goals,shots:r=>r.shots,shots_on_target:r=>r.shots_on_target,corners:r=>r.corners,fouls:r=>r.fouls};
  teamForm.push({team_id:tid,scope:'OBSERVED_IN_STORED_EVENTS_ONLY',all:lastSamples(rows,vals),home:lastSamples(rows.filter(r=>r.condition==='Local'),vals),away:lastSamples(rows.filter(r=>r.condition==='Visita'),vals)});
 }
 for(const [pid,rows] of recentPlayer){const vals={minutes:r=>r.minutes,shots_total:r=>r.shots_total,shots_on_target:r=>r.shots_on_target,goals:r=>r.goals,assists:r=>r.assists,fouls:r=>r.fouls_committed};playerForm.push({player_id:pid,scope:'OBSERVED_IN_STORED_EVENTS_ONLY',all:lastSamples(rows,vals)});}
 for(const [rid,rows] of recentRef)refereeForm.push({referee_id:rid,scope:'OBSERVED_IN_STORED_EVENTS_NOT_ADDED_TO_HISTORICAL_MASTER',all:lastSamples(rows,{yellow_cards:r=>r.yellow,fouls:r=>r.fouls})});
 const unmatched=matches.filter(x=>x.referee_name&&!x.referee_id).map(x=>({event_id:x.event_id,referee_name:x.referee_name}));
 const metadata={schema_version:SCHEMA,extractor_version:VERSION,provider:'sofascore',generated_at:nowIso(),window:{from:settings.from??null,to:settings.to??null},source_masters:data.source,confidence_note:'Las rachas se calculan SOLO sobre partidos disponibles en los checkpoints locales e historial importado; la cobertura puede ser discontinua y no equivale a probabilidades futuras.',referee_note:'Los promedios históricos de 03_ARBITROS se conservan sin fusionarlos a ciegas con nuevos partidos; el resumen reciente se calcula aparte.',observed_dates:{first:matches[0]?.date??null,last:matches.at(-1)?.date??null},counts:{...totals,teams:teams.size,players:players.size,referees:refs.size,team_stat_rows:teamMatchStats.length,player_stat_rows:playerMatchStats.length,cards:cards.length,referee_assignments_unmatched:unmatched.length},warnings:[...data.warnings,...(settings.complete===false?['EXTRACCION_INCOMPLETA']:[])]};
 return {metadata,teams:[...teams.values()],players:[...players.values()],referees:[...refs.values()],matches,team_match_stats:teamMatchStats,player_match_stats:playerMatchStats,cards,team_form:teamForm,player_form:playerForm,referee_form:refereeForm,audit:{issues,unmatched_referee_names:unmatched}};
}

// ── Motor reanudable, a diferencia del extractor anterior NO serializa
// miles de partidos en un único registro IndexedDB en cada petición.
class Collector {
 constructor(options,io){
  this.options={...options,speed:cap(options.speed,1,6,2),workers:cap(options.workers,1,6,3),maxRequests:cap(options.maxRequests,1,50000,12000)};
  this.io=io;this.window=mustWindow(this.options);this.key=sessionKey(this.options);
  this.gateTail=Promise.resolve();this.nextAllowed=0;this.globalCooldown=0;this.requests=0;
  this.delay=SPEED_GAP[this.options.speed];this.fatal=null;this.logs=[];
  this.report={pages:0,cache_pages:0,events_discovered:0,events_processed:0,events_reused:0,errors:[],warnings:[]};
 }
 log(s){this.io.log?.(s);}
 check(){if(this.fatal)throw this.fatal;if(this.io.stopped?.())throw Error('PAUSADO_POR_USUARIO');}
 async checkPause(){this.check();while(this.io.paused?.()){await this.io.wait(300);this.check();}}
 async gate(){
  const turn=this.gateTail.then(async()=>{
   await this.checkPause();
   const jitter=Math.floor(Math.random()*Math.min(240,this.delay/4));
   const remain=Math.max(0,this.nextAllowed+this.delay+jitter-Date.now(),this.globalCooldown-Date.now());
   if(remain)await this.io.wait(remain);
   if(this.globalCooldown>Date.now())await this.io.wait(this.globalCooldown-Date.now());
   await this.checkPause();this.nextAllowed=Date.now();
  });
  this.gateTail=turn.catch(()=>{});return turn;
 }
 async fetch(route,{allowMissing=false}={}){
  this.check();let retry=0;
  while(true){
   await this.gate();
   if(this.requests>=this.options.maxRequests)throw Error('LIMITE_SOLICITUDES');
   this.requests++;
   let response;
   try{response=await this.io.fetch(API+route);}catch(e){
    if(retry++>=3)throw Error(`NETWORK_FAIL ${route}: ${e.message}`);
    await this.io.wait(Math.min(10000,1200*retry));continue;
   }
   const code=Number(response?.status);
   if(code===403){this.fatal=Error('PAUSA_SEGURA_403');this.log('403: parada segura. No se intentará evadir el bloqueo.');throw this.fatal;}
   if(code===429){
    let retryAfter=response.headers?.get?.('retry-after')??null;
    let ms=0;
    if(retryAfter!==null){const n=Number(retryAfter);if(Number.isFinite(n)&&n>=0)ms=n*1000;else {const t=Date.parse(retryAfter);if(Number.isFinite(t))ms=Math.max(0,t-Date.now());}}
    ms=Math.min(180000,Math.max(ms,15000*2**retry));
    this.globalCooldown=Date.now()+ms;
    this.delay=Math.min(4500,this.delay+250);
    this.log(`429: espera ${Math.ceil(ms/1000)}s, intento ${retry+1}/3.`);
    if(retry++>=2){this.fatal=Error('PAUSA_SEGURA_429');throw this.fatal;}
    await this.io.wait(ms);continue;
   }
   if(allowMissing&&[404,410,422].includes(code))return {__missing:true,status:code};
   if([408,500,502,503,504].includes(code)&&retry<3){retry++;await this.io.wait(1400*retry);continue;}
   if(!response?.ok)throw Error(`HTTP_${code} ${route}`);
   this.delay=Math.max(SPEED_GAP[this.options.speed],this.delay-8);
   try{return await response.json();}catch(e){throw Error(`JSON_INVALIDO ${route}: ${e.message}`);}
  }
 }
 static seasonYears(s){
  const raw=String(s?.year??s?.name??'');const years=[];
  for(const m of raw.matchAll(/\b(?:19|20)\d{2}\b/g))years.push(Number(m[0]));
  if(years.length===1){const short=raw.match(/(?:19|20)\d{2}\s*[\/\-]\s*(\d{2})\b/);if(short){let year=Math.floor(years[0]/100)*100+Number(short[1]);if(year<years[0])year+=100;years.push(year);}}
  if(!years.length){const sh=raw.match(/\b(\d{2})\s*[\/\-]\s*(\d{2})\b/);if(sh)years.push(2000+Number(sh[1]),2000+Number(sh[2]));}
  return years;
 }
 relevantSeasons(seasons){
  const a=new Date(this.window.from).getUTCFullYear(),b=new Date(this.window.to).getUTCFullYear();
  const out=seasons.filter(s=>Collector.seasonYears(s).some(y=>y>=a-1&&y<=b+1));
  if(!out.length){this.report.warnings.push('SEASONS_YEAR_NOT_MATCHED');return seasons.slice(0,2);}
  return out.slice(0,5);
 }
 pageKey(cid,sid,direction,page){return `${this.key}:page:${cid}:${sid}:${direction}:${page}`;}
 eventKey(id){return `${this.key}:event:${id}`;}
 async upsertEvent(e,competition,season){
  const id=digits(e?.id);if(!id)return false;
  const when=Number(e.startTimestamp)*1000;
  if(!Number.isFinite(when)||when<this.window.from||when>this.window.to)return false;
  const unique=digits(e.tournament?.uniqueTournament?.id);
  if(unique&&unique!==digits(competition.id))return false;
  const key=this.eventKey(id),old=await this.io.getEvent(key);
  if(this.options.onlyMasterTeams){
   const teams=this.options.masterTeamIds;
   if(!(teams?.has(digits(e.homeTeam?.id))||teams?.has(digits(e.awayTeam?.id))))return false;
  }
  const result=old??{key,event_id:id,competition,season,event:e,fetched:{},missing:{},errors:[]};
  const transitioned=!!old&&isFinished(e)&&!isFinished(old.event);
  if(!old||!old.fetched?.detail||transitioned)result.event=e;
  if(transitioned)result.fetched.detail=null; // necesita nuevo detalle para captar árbitro y sede finales
  if(!old)result.discovered_at=nowIso();
  result.competition=competition;result.season=season;
  // Persistir SOLO filas nuevas o partidos con estado cambiado evita reescrituras excesivas.
  if(!old||result.event===e){await this.io.putEvent(result);return true;}
  return false;
 }
 async scanDirection(competition,season,direction){
  const cid=digits(competition.id),sid=digits(season.id);
  for(let page=0;page<MAX_PAGES;page++){
   await this.checkPause();
   const key=this.pageKey(cid,sid,direction,page);
   const previous=await this.io.getPage(key);
   const ttl=6*3600*1000;
   if(previous?.complete&&!this.options.refreshScans&&Date.now()-Date.parse(previous.saved_at)<ttl){
    this.report.cache_pages++;
    if(previous.terminal)return previous.missing_status?'missing':'ok';
    continue;
   }
   const x=await this.fetch(`/unique-tournament/${cid}/season/${sid}/events/${direction}/${page}`,{allowMissing:true});
   if(x?.__missing){
    this.report.warnings.push(`PAGE_UNAVAILABLE ${cid}/${sid}/${direction}/${page} (${x.status})`);
    await this.io.putPage({key,complete:true,terminal:true,missing_status:x.status,saved_at:nowIso()});return 'missing';
   }
   const events=Array.isArray(x?.events)?x.events:[];
   let kept=0;
   for(const e of events)if(await this.upsertEvent(e,competition,season))kept++;
   const ts=events.map(e=>Number(e.startTimestamp)*1000).filter(Number.isFinite);
   const past=direction==='last'&&ts.length&&ts.every(t=>t<this.window.from);
   const future=direction==='next'&&ts.length&&ts.every(t=>t>this.window.to);
   const terminal=!events.length||x.hasNextPage===false||past||future;
   await this.io.putPage({key,complete:true,terminal:!!terminal,saved_at:nowIso(),event_count:events.length,kept});
   this.report.pages++;this.log(`Liga ${cid} · temporada ${sid} · ${direction} P${page} · ${events.length} eventos · nuevos ${kept} · req ${this.requests}`);
   if(terminal)return 'ok';
  }
  throw Error(`PAGINACION_MAXIMA ${cid}/${sid}/${direction}: ventana posiblemente incompleta`);
 }
 async scanCompetition(competition){
  const key=this.key+':season:'+competition.id;
  let entry=await this.io.getPage(key),seasons=null;
  if(entry?.seasons&&Date.now()-Date.parse(entry.saved_at)<24*3600*1000&&!this.options.refreshScans)seasons=entry.seasons;
  if(!seasons){
   const response=await this.fetch(`/unique-tournament/${competition.id}/seasons`,{allowMissing:true});
   if(response?.__missing){this.report.errors.push({competition:competition.id,reason:`SEASONS_${response.status}`});return;}
   seasons=this.relevantSeasons(response?.seasons??[]);
   await this.io.putPage({key,seasons,saved_at:nowIso()});
  }
  if(!seasons.length){this.report.errors.push({competition:competition.id,reason:'SIN_TEMPORADAS'});return;}
  for(const season of seasons){
   const results=[];for(const dir of ['last','next'])results.push(await this.scanDirection(competition,season,dir));
   if(results.every(x=>x==='missing'))this.report.errors.push({competition:competition.id,season:season.id,reason:'BOTH_DIRECTIONS_UNAVAILABLE'});
  }
 }
 async endpoint(row,kind,route,{optional=true,refreshAfterMs=0}={}){
  const stamp=row.fetched?.[kind];
  if(stamp&&!this.options.refreshDetails){
   const ms=Date.parse(stamp.at);
   if(stamp.status==='ok'||(stamp.status==='missing'&&Date.now()-ms<refreshAfterMs))return;
  }
  const result=await this.fetch(route,{allowMissing:optional});
  row.fetched??={};row.missing??={};
  if(result?.__missing){row[kind]=null;row.fetched[kind]={status:'missing',code:result.status,at:nowIso()};}
  else{row[kind]=result;row.fetched[kind]={status:'ok',at:nowIso()};}
  row.updated_at=nowIso();
  await this.io.putEvent(row); // checkpoint tras CADA endpoint: no repetimos trabajo terminado
 }
 async process(row){
  await this.checkPause();
  const id=digits(row?.event_id??row?.event?.id);if(!id)return;
  // Si el partido empezó a jugarse desde la última ejecución, refrescar el detalle.
  const kickoffMs=Number(row.event?.startTimestamp)*1000;
  const refetchMs=Number.isFinite(kickoffMs)&&kickoffMs<Date.now()+48*3600*1000?30*60000:6*3600000;
  const needsRefresh=!isFinished(row.event)&&(!row.updated_at||Date.now()-Date.parse(row.updated_at)>refetchMs);
  if(this.options.refreshDetails||!row.fetched?.detail||needsRefresh){
   try{
    const r=await this.fetch(`/event/${id}`,{allowMissing:true});
    if(!r?.__missing&&r?.event){row.event=r.event;row.fetched??={};row.fetched.detail={status:'ok',at:nowIso()};}
    else{row.errors??=[];row.errors.push({reason:'DETAIL_MISSING',at:nowIso()});row.fetched??={};row.fetched.detail={status:'missing',at:nowIso()};}
    row.updated_at=nowIso();await this.io.putEvent(row);
   }catch(e){if(STOP_ERRORS.has(e.message))throw e;row.errors??=[];row.errors.push({reason:e.message,at:nowIso()});await this.io.putEvent(row);this.report.errors.push({event_id:id,reason:e.message});return;}
  }
  if(isExcluded(row.event)){this.report.events_processed++;return;}
  const ended=isFinished(row.event);
  const near=Number(row.event.startTimestamp)*1000<Date.now()+48*3600*1000;
  const jobs=ended?[
   ['statistics',`/event/${id}/statistics`],['lineups',`/event/${id}/lineups`],['incidents',`/event/${id}/incidents`]
  ]:near?[['lineups',`/event/${id}/lineups`]]:[];
  try{
   let reused=true;
   for(const [type,route] of jobs){
    const a=row.fetched?.[type];const ttl=ended?24*3600*1000:3*3600*1000;
    if(!a||this.options.refreshDetails||a.status==='missing'&&Date.now()-Date.parse(a.at)>ttl)reused=false;
    await this.endpoint(row,type,route,{optional:true,refreshAfterMs:ttl});
   }
   if(reused)this.report.events_reused++;
   this.report.events_processed++;
  }catch(e){
   if(STOP_ERRORS.has(e.message))throw e;
   row.errors??=[];row.errors.push({reason:e.message,at:nowIso()});
   await this.io.putEvent(row);
   this.report.errors.push({event_id:id,reason:e.message});
  }
 }
 async pool(items,fn){
  let index=0,done=0;
  const worker=async()=>{while(index<items.length){
    await this.checkPause();const i=index++;if(i>=items.length)return;
    try{await fn(items[i]);}catch(e){if(STOP_ERRORS.has(e.message)||this.fatal)throw e;this.report.errors.push({id:items[i]?.id,reason:e.message});}
    done++;this.io.progress?.({stage:'events',done,total:items.length,requests:this.requests});
   }};
  await Promise.all(Array.from({length:Math.min(this.options.workers,Math.max(1,items.length))},()=>worker()));
 }
 async run(){
  let meta=(await this.io.getMeta(this.key))??{key:this.key,version:VERSION,from:this.options.from,to:this.options.to,created_at:nowIso(),complete:false};
  meta.complete=false;meta.run_started_at=nowIso();meta.attempts=(meta.attempts||0)+1;await this.io.putMeta(meta);
  try{
   this.log(`Comenzando ${this.options.competitions.length} competiciones · velocidad ${this.options.speed} · workers ${this.options.workers}`);
   for(let i=0;i<this.options.competitions.length;i++){
    await this.checkPause();const competition=this.options.competitions[i];
    this.io.progress?.({stage:'scan',done:i,total:this.options.competitions.length,requests:this.requests});
    try{await this.scanCompetition(competition);}catch(e){
     if(STOP_ERRORS.has(e.message))throw e;
     this.report.errors.push({competition:competition.id,reason:e.message});
     this.log(`ERROR liga ${competition.id}: ${e.message}`);
    }
   }
   const rows=(await this.io.listEvents(this.key+':event:')).sort((a,b)=>Number(a.event?.startTimestamp)-Number(b.event?.startTimestamp));
   this.report.events_discovered=rows.length;
   this.log(`Eventos únicos hallados: ${rows.length}. Analizando con checkpoints...`);
   await this.pool(rows,r=>this.process(r));
   meta.complete=this.report.errors.length===0;
   meta.last_status=meta.complete?'COMPLETO':'PARCIAL_CON_ERRORES';
   if(meta.complete)meta.last_successful_to=this.options.to;
  }catch(e){
   meta.complete=false;meta.last_status=STOP_ERRORS.has(e.message)?e.message:'ERROR';
   this.report.errors.push({reason:e.message,at:nowIso()});this.log(`Se conservan todos los checkpoints: ${e.message}`);
  }finally{
   meta.last_attempt_at=nowIso();meta.requests_last_run=this.requests;
   meta.last_report=this.report;await this.io.putMeta(meta);
  }
  return {meta,report:this.report,requests:this.requests,key:this.key};
 }
}

function openDatabase(){return new Promise((resolve,reject)=>{
 const r=indexedDB.open(DB_NAME,DB_VERSION);
 r.onupgradeneeded=()=>{for(const name of ['meta','pages','events','masters'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'key'});};
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
});}
function dbAdapter(db){
 const get=(store,key)=>new Promise((resolve,reject)=>{const q=db.transaction(store,'readonly').objectStore(store).get(key);q.onsuccess=()=>resolve(q.result??null);q.onerror=()=>reject(q.error);});
 const put=(store,value)=>new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);});
 const allPrefix=(store,prefix)=>new Promise((resolve,reject)=>{
  const res=[],tx=db.transaction(store,'readonly');
  const range=IDBKeyRange.bound(prefix,prefix+'\uffff',false,false);
  const req=tx.objectStore(store).openCursor(range);
  req.onsuccess=()=>{const cur=req.result;if(cur){res.push(cur.value);cur.continue();}};
  req.onerror=()=>reject(req.error);tx.oncomplete=()=>resolve(res);tx.onerror=()=>reject(tx.error);
 });
 return {getMeta:k=>get('meta',k),putMeta:v=>put('meta',v),getPage:k=>get('pages',k),putPage:v=>put('pages',v),getEvent:k=>get('events',k),putEvent:v=>put('events',v),listEvents:p=>allPrefix('events',p),listAllEvents:()=>allPrefix('events',''),getMaster:k=>get('masters',k),putMaster:v=>put('masters',v),listMeta:()=>allPrefix('meta','['),listPages:p=>allPrefix('pages',p)};
}

// Convertir al formato anterior de sync.cjs SIN afirmar compatibilidad automática:
// mantiene schema, events[id].event/statistics/lineups/incidents, scans y complete.
function rawEnvelope(records,meta,report,compiled){
 const ev={};for(const r of uniqueEventRows(records))if(r.event?.id){
  const finished=isFinished(r.event);
  ev[String(r.event.id)]={event:r.event,competition:r.competition,season:r.season,detail:r.fetched?.detail?.status==='ok',done:r.fetched?.detail?.status==='ok'&&(!finished||['statistics','lineups','incidents'].every(k=>r.fetched?.[k]?.status)),statistics:r.statistics??null,lineups:r.lineups??null,incidents:r.incidents??null};
 }
 return {schema:'incastats.unified.raw.v1',schema_version:SCHEMA,from:meta.from,to:meta.to,window_key:meta.key,created_at:meta.created_at,completed_at:meta.complete?meta.last_attempt_at:null,complete:!!meta.complete,requests:meta.requests_last_run||0,events:ev,scans:{},errors:report?.errors??[],unified:compiled};
}

const INCA_COMPETITIONS=[
  {
    "id": 17,
    "name": "Premier League",
    "country": "INGLATERRA",
    "region": "EUROPA"
  },
  {
    "id": 18,
    "name": "Championship",
    "country": "INGLATERRA",
    "region": "EUROPA"
  },
  {
    "id": 24,
    "name": "League One",
    "country": "INGLATERRA",
    "region": "EUROPA"
  },
  {
    "id": 25,
    "name": "League Two",
    "country": "INGLATERRA",
    "region": "EUROPA"
  },
  {
    "id": 8,
    "name": "LaLiga EA Sports",
    "country": "ESPAÑA",
    "region": "EUROPA"
  },
  {
    "id": 54,
    "name": "LaLiga Hypermotion",
    "country": "ESPAÑA",
    "region": "EUROPA"
  },
  {
    "id": 23,
    "name": "Serie A",
    "country": "ITALIA",
    "region": "EUROPA"
  },
  {
    "id": 53,
    "name": "Serie B",
    "country": "ITALIA",
    "region": "EUROPA"
  },
  {
    "id": 35,
    "name": "Bundesliga",
    "country": "ALEMANIA",
    "region": "EUROPA"
  },
  {
    "id": 44,
    "name": "2. Bundesliga",
    "country": "ALEMANIA",
    "region": "EUROPA"
  },
  {
    "id": 34,
    "name": "Ligue 1",
    "country": "FRANCIA",
    "region": "EUROPA"
  },
  {
    "id": 182,
    "name": "Ligue 2",
    "country": "FRANCIA",
    "region": "EUROPA"
  },
  {
    "id": 238,
    "name": "Liga Portugal",
    "country": "PORTUGAL",
    "region": "EUROPA"
  },
  {
    "id": 239,
    "name": "Liga Portugal 2",
    "country": "PORTUGAL",
    "region": "EUROPA"
  },
  {
    "id": 37,
    "name": "Eredivisie",
    "country": "PAÍSES BAJOS",
    "region": "EUROPA"
  },
  {
    "id": 131,
    "name": "Eerste Divisie",
    "country": "PAÍSES BAJOS",
    "region": "EUROPA"
  },
  {
    "id": 38,
    "name": "Belgian Pro League",
    "country": "BÉLGICA",
    "region": "EUROPA"
  },
  {
    "id": 52,
    "name": "Süper Lig",
    "country": "TURQUÍA",
    "region": "EUROPA"
  },
  {
    "id": 98,
    "name": "1. Lig",
    "country": "TURQUÍA",
    "region": "EUROPA"
  },
  {
    "id": 45,
    "name": "Austrian Bundesliga",
    "country": "AUSTRIA",
    "region": "EUROPA"
  },
  {
    "id": 215,
    "name": "Swiss Super League",
    "country": "SUIZA",
    "region": "EUROPA"
  },
  {
    "id": 39,
    "name": "Danish Superliga",
    "country": "DINAMARCA",
    "region": "EUROPA"
  },
  {
    "id": 40,
    "name": "Allsvenskan",
    "country": "SUECIA",
    "region": "EUROPA"
  },
  {
    "id": 20,
    "name": "Eliteserien",
    "country": "NORUEGA",
    "region": "EUROPA"
  },
  {
    "id": 152,
    "name": "Liga I",
    "country": "RUMANÍA",
    "region": "EUROPA"
  },
  {
    "id": 185,
    "name": "Super League Greece",
    "country": "GRECIA",
    "region": "EUROPA"
  },
  {
    "id": 325,
    "name": "Brasileirão Série A",
    "country": "BRASIL",
    "region": "AMÉRICA"
  },
  {
    "id": 390,
    "name": "Brasileirão Série B",
    "country": "BRASIL",
    "region": "AMÉRICA"
  },
  {
    "id": 155,
    "name": "Liga Profesional Argentina",
    "country": "ARGENTINA",
    "region": "AMÉRICA"
  },
  {
    "id": 406,
    "name": "Liga 1 Perú",
    "country": "PERÚ",
    "region": "AMÉRICA"
  },
  {
    "id": 242,
    "name": "MLS",
    "country": "EE. UU. / CANADÁ",
    "region": "AMÉRICA"
  },
  {
    "id": 7,
    "name": "UEFA Champions League",
    "country": "UEFA",
    "region": "EUROPA"
  },
  {
    "id": 679,
    "name": "UEFA Europa League",
    "country": "UEFA",
    "region": "EUROPA"
  },
  {
    "id": 17015,
    "name": "UEFA Conference League",
    "country": "UEFA",
    "region": "EUROPA"
  }
];

// ── INTERFAZ: en navegador, y exportaciones puras para tests sin red en Node.
if(typeof module!=='undefined'&&module.exports)module.exports={VERSION,SCHEMA,INCA_COMPETITIONS,Collector,masterBundle,normalizeMaster,parseTeamStats,parseCards,parsePlayers,refFromEvent,unify,rawEnvelope,sessionKey};
if(typeof document==='undefined'||typeof window==='undefined')return;
if(!/(^|\.)sofascore\.com$/i.test(location.hostname)){
 console.warn('[INCASTATS V4] Abre https://www.sofascore.com/football antes de ejecutar este script.');return;
}
if(document.getElementById('inca-unifier-v4')){document.getElementById('inca-unifier-v4').scrollIntoView();return;}
(async()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const db=await openDatabase(),store=dbAdapter(db),persist='inca_v4_sofa_ui_state';
 let saved={};try{saved=JSON.parse(localStorage.getItem(persist)||'{}')}catch{}
 const localDatetime=d=>{const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,16);};
 const initialFrom=saved.from??localDatetime(new Date(Date.now()-15*86400000));
 const initialTo=saved.to??localDatetime(new Date());
 const style=document.createElement('style');style.textContent=`
 #inca-unifier-v4{position:fixed!important;z-index:2147483647!important;top:10px;right:12px;width:610px;max-width:96vw;max-height:96vh;overflow:auto;background:#0a101b;color:#e7edf7;border:1px solid #a88438;border-radius:14px;box-shadow:0 14px 70px #000b;font:12px/1.5 system-ui,Arial,sans-serif;direction:ltr}
 #inca-unifier-v4 *{box-sizing:border-box}#inca-unifier-v4 .iu-h{padding:14px 16px;background:linear-gradient(125deg,#172239,#0c111c);border-bottom:1px solid #846d40;position:sticky;top:0;z-index:2}#inca-unifier-v4 h2{font:800 17px system-ui;margin:0;color:#f7d581}#inca-unifier-v4 h3{font:800 12px system-ui;color:#e7c16e;margin:0 0 8px;text-transform:uppercase;letter-spacing:.4px}
 #inca-unifier-v4 .iu-body{padding:12px 15px}#inca-unifier-v4 .iu-card{background:#111a29;border:1px solid #263448;border-radius:10px;padding:10px;margin-bottom:10px}#inca-unifier-v4 label{display:block;color:#c5cde0;font-size:11px}#inca-unifier-v4 input[type=datetime-local],#inca-unifier-v4 input[type=number],#inca-unifier-v4 select{background:#080f1b;color:#e7f0fa;border:1px solid #43516a;border-radius:7px;padding:7px;min-width:0;width:100%;font:12px system-ui;min-height:34px}
 #inca-unifier-v4 .iu-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:7px}#inca-unifier-v4 .iu-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}#inca-unifier-v4 button{border:1px solid #48546a;background:#243349;color:#f7fbff;padding:9px 11px;border-radius:7px;cursor:pointer;font:700 11px system-ui;flex:1;min-width:105px}#inca-unifier-v4 button:disabled{opacity:.4;cursor:default}#inca-unifier-v4 button.iu-gold{background:#d6ac53;color:#182130;border-color:#f4cc75}#inca-unifier-v4 button.iu-green{background:#1e745d;border-color:#3da584}#inca-unifier-v4 .iu-muted{color:#90a3b8;font-size:11px}#inca-unifier-v4 .iu-alert{color:#ffdf96}#inca-unifier-v4 .iu-check{display:flex;align-items:center;gap:6px;margin-top:6px}#inca-unifier-v4 .iu-check input{accent-color:#d6ac53}#inca-unifier-v4 .iu-competitions{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;max-height:145px;overflow:auto;background:#0b1524;padding:8px;border-radius:6px;margin-top:7px}#inca-unifier-v4 .iu-competitions label{font-size:10px;display:flex;gap:5px;align-items:center}#inca-unifier-v4 .iu-competitions input{accent-color:#d6ac53}#inca-unifier-v4 pre{margin:6px 0 0;white-space:pre-wrap;word-break:break-word;max-height:150px;overflow:auto;background:#070d17;border:1px solid #273444;padding:8px;color:#a8e7c3;border-radius:7px;font:10px/1.4 Consolas,monospace}#inca-unifier-v4 .iu-progress{height:8px;background:#28384c;border-radius:6px;overflow:hidden;margin-top:8px}#inca-unifier-v4 .iu-progress>div{height:100%;background:linear-gradient(90deg,#c18c2f,#ffdf86);width:0%}#inca-unifier-v4 .iu-file{width:100%;padding:8px;border:1px dashed #a88438;background:#151e30;border-radius:7px;color:#d7e7f3}#inca-unifier-v4 .iu-small{font-size:10px;color:#a8bad0}`;
 document.head.appendChild(style);
 const panel=document.createElement('section');panel.id='inca-unifier-v4';panel.innerHTML=`
 <div class="iu-h"><div style="display:flex;justify-content:space-between;gap:10px"><div><h2>INCASTATS · SOFA UNIFIER V4</h2><div class="iu-small">MASTERS + PARTIDOS + STATS + ÁRBITROS · CHECKPOINT REAL</div></div><button id="iu-close" style="flex:0;min-width:40px;padding:7px">✕</button></div></div>
 <div class="iu-body">
 <div class="iu-card"><h3>01 · Importar MASTERS JSON</h3><label>Selecciona juntos: MASTER_TEAMS_ACTUALIZADO.json, MASTER_PLAYERS_ACTUALIZADO.json y 03_ARBITROS.json</label><input id="iu-files" class="iu-file" type="file" accept=".json,application/json" multiple><div id="iu-masters" class="iu-muted" style="margin-top:6px">Sin importar. También se recuperan del navegador cuando existen.</div></div>
 <div class="iu-card"><h3>02 · Fechas y seguridad</h3><div class="iu-grid"><label>Desde <input id="iu-from" type="datetime-local" value="${esc(initialFrom)}"></label><label>Hasta <input id="iu-to" type="datetime-local" value="${esc(initialTo)}"></label><label>Velocidad (1 segura – 6 rápida)<select id="iu-speed">${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${n===(saved.speed??2)?'selected':''}>${n} · ${SPEED_GAP[n]} ms mín. global</option>`).join('')}</select></label><label>Workers (consultas con gate global)<select id="iu-workers">${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${n===(saved.workers??3)?'selected':''}>${n} worker${n>1?'s':''}</option>`).join('')}</select></label><label>Límite de solicitudes por ejecución<input id="iu-max" type="number" min="1" max="50000" value="${saved.max??12000}"></label><label>Solape delta (horas)<input id="iu-overlap" type="number" min="0" max="168" value="${saved.overlap??48}"></label></div>
 <label class="iu-check"><input id="iu-only-teams" type="checkbox" ${saved.onlyTeams?'checked':''}> Extraer partidos solo si juega algún equipo del MASTER</label>
 <label class="iu-check"><input id="iu-refresh-scans" type="checkbox"> Reescanear páginas aunque exista checkpoint reciente (actualización)</label>
 <label class="iu-check"><input id="iu-refresh-details" type="checkbox"> Forzar actualización de detalles/stats ya obtenidos (más requests)</label>
 <div class="iu-muted" style="margin-top:5px">Nunca salta bloqueos 403. Respeta 429, mantiene checkpoint por página, evento y endpoint. Límite de ventana: 120 días.</div>
 </div>
 <div class="iu-card"><h3>03 · Competiciones (${INCA_COMPETITIONS.length})</h3><div class="iu-row" style="margin-top:0"><button id="iu-all">Seleccionar todas</button><button id="iu-none">Deseleccionar</button></div><div class="iu-competitions" id="iu-competitions">${INCA_COMPETITIONS.map(c=>`<label><input type="checkbox" data-comp="${Number(c.id)}" ${!saved.selected||saved.selected.includes(Number(c.id))?'checked':''}> ${esc(c.name)}</label>`).join('')}</div></div>
 <div class="iu-card"><h3>04 · Extraer / reanudar</h3><div class="iu-row"><button id="iu-start" class="iu-gold">▶ INICIAR / CONTINUAR</button><button id="iu-pause">⏸ PAUSAR</button><button id="iu-stop">■ DETENER</button></div><div id="iu-status" class="iu-muted" style="margin-top:9px">Preparado.</div><div class="iu-progress"><div id="iu-bar"></div></div><div id="iu-count" class="iu-muted" style="margin-top:5px">Caché persistente IndexedDB.</div><pre id="iu-log">V4 lista. Importa tus tres masters y selecciona la ventana.</pre></div>
 <div class="iu-card"><h3>05 · Exportar UNIFICADO</h3><label class="iu-check"><input id="iu-all-history" type="checkbox" checked> Acumular TODOS los checkpoints locales + historial importado (sin duplicar Event_ID)</label><div class="iu-row"><button id="iu-export" class="iu-gold">💾 JSON UNIFICADO + RAW</button><button id="iu-stats" class="iu-green">📊 SOLO STATS</button><button id="iu-checkpoint">🛟 CHECKPOINT</button></div><div class="iu-row"><button id="iu-confirm" disabled>✓ CONFIRMAR JSON GUARDADO</button><button id="iu-import-checkpoint">📂 IMPORTAR CHECKPOINT</button></div><input id="iu-checkpoint-file" type="file" accept=".json" style="display:none"><div id="iu-export-info" class="iu-muted" style="margin-top:5px">También puedes unificar sin conexión usando los masters y checkpoints importados. El RAW mantiene la estructura anterior, pero la compatibilidad con tu BAT requiere comprobar el sync.cjs. Los promedios históricos de árbitros se conservan.</div></div>
 <div class="iu-small">Solo trabaja con datos expuestos por SofaScore en tu navegador. No ejecuta el BAT ni modifica GitHub/VS Code automáticamente. Las cuotas no se extraen aquí.</div></div>`;
 document.body.appendChild(panel);
 const $=id=>panel.querySelector('#iu-'+id);
 const log=(msg)=>{const ts=new Date().toLocaleTimeString();const previous=$('log').textContent.split('\n').slice(-110);previous.push(`[${ts}] ${msg}`);$('log').textContent=previous.join('\n');$('log').scrollTop=$('log').scrollHeight;};
 let running=false,paused=false,stopped=false,lastDownloaded=null,activeCollector=null;
 function selectedComps(){const ids=new Set([...panel.querySelectorAll('[data-comp]:checked')].map(x=>Number(x.dataset.comp)));return INCA_COMPETITIONS.filter(c=>ids.has(c.id));}
 function options(){
  const fromMs=new Date($('from').value).getTime(),toMs=new Date($('to').value).getTime(),hours=cap($('overlap').value,0,168,48);
  if(!Number.isFinite(fromMs)||!Number.isFinite(toMs))throw Error('Revisa las fechas.');
  const result={from:new Date(fromMs-hours*3600000).toISOString(),to:new Date(toMs).toISOString(),requestedFrom:new Date(fromMs).toISOString(),overlapHours:hours,competitions:selectedComps(),speed:Number($('speed').value),workers:Number($('workers').value),maxRequests:Number($('max').value),onlyMasterTeams:$('only-teams').checked,refreshScans:$('refresh-scans').checked,refreshDetails:$('refresh-details').checked};
  mustWindow(result);return result;
 }
 function saveUi(){try{localStorage.setItem(persist,JSON.stringify({from:$('from').value,to:$('to').value,speed:Number($('speed').value),workers:Number($('workers').value),max:Number($('max').value),overlap:Number($('overlap').value),onlyTeams:$('only-teams').checked,selected:selectedComps().map(x=>x.id)}));}catch(e){log('No se guardó configuración local: '+e.message);}}
 for(const id of ['from','to','speed','workers','max','overlap','only-teams'])$(id).addEventListener('change',saveUi);
 $('competitions').addEventListener('change',saveUi);
 $('all').onclick=()=>{panel.querySelectorAll('[data-comp]').forEach(x=>x.checked=true);saveUi();};
 $('none').onclick=()=>{panel.querySelectorAll('[data-comp]').forEach(x=>x.checked=false);saveUi();};
 async function readMasters(){const x={};for(const type of ['teams','players','referees']){const v=await store.getMaster(type);if(v?.raw)x[type]=v.raw;}return x;}
 async function summaryMasters(){const raw=await readMasters();let norm=null;try{norm=masterBundle(raw);}catch(e){log(e.message);}const n=norm?.source??{};$('masters').textContent=`Equipos: ${n.teams?.count??0} · Jugadores: ${n.players?.count??0} · Árbitros: ${n.referees?.count??0}. ${norm?.warnings.join(' · ')||''}`;return norm;}
 await summaryMasters();
 $('files').onchange=async ev=>{
  const files=[...ev.target.files];if(!files.length)return;
  const pending={};const notices=[];
  for(const f of files){
   try{
    if(f.size>80*1024*1024)throw Error('Supera 80 MB. Usa un master menor o divide antes de importarlo.');
    const json=JSON.parse(await f.text());
    const kinds=['teams','players','referees'].filter(k=>Array.isArray(json?.[k]));
    if(kinds.length!==1)throw Error('No se reconoció el tipo. Se espera un JSON con teams[], players[] o referees[].');
    const kind=kinds[0],parsed=normalizeMaster(kind,json);
    if(!parsed.items.length)throw Error('Lista vacía o sin identificadores válidos.');
    if(pending[kind])throw Error('Has seleccionado dos '+kind+' distintos.');
    pending[kind]=json;notices.push(`${kind}: ${parsed.items.length} IDs (${parsed.invalid.length} inválidos, ${parsed.duplicates.length} duplicados)`);
   }catch(e){log(`✕ ${f.name}: ${e.message}`);}
  }
  for(const [key,raw] of Object.entries(pending))await store.putMaster({key,raw,imported_at:nowIso()});
  if(notices.length)log('MASTERS: '+notices.join(' | '));await summaryMasters();
 };
 $('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'▶ REANUDAR':'⏸ PAUSAR';log(paused?'Pausa solicitada.':'Extracción reanudada.');};
 $('stop').onclick=()=>{stopped=true;paused=false;log('Parada solicitada. Los checkpoints persisten.');};
 $('close').onclick=()=>{if(running){log('Detén el proceso antes de cerrar el panel.');return;}panel.remove();style.remove();db.close();};
 async function getAdapter(){const o=options();const masters=await readMasters();const norm=masterBundle(masters);
  if(['teams','players','referees'].some(x=>!norm[x].length))throw Error('Primero importa los 3 MASTERS (teams, players, referees). Sin ellos no se inicia.');
  o.masterTeamIds=new Set(norm.teams.map(t=>t.id));return {o,masters,norm};
 }
 async function readRun(){const {o,masters}=await getAdapter();const key=sessionKey(o);
  const meta=(await store.getMeta(key))??{key,version:VERSION,from:o.from,to:o.to,created_at:nowIso(),complete:false,last_status:'SOLO_IMPORTACION_SIN_EXTRACCION'};
  const currentRows=await store.listEvents(key+':event:');
  const rows=$('all-history').checked?await store.listAllEvents():currentRows;
  return {o,masters,key,meta,rows,currentRows};
 }
 function downloadJSON(value,filename){
  const blob=new Blob([JSON.stringify(value)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},120000);
  log(`DESCARGA SOLICITADA: ${filename} (${(blob.size/1048576).toFixed(1)} MB)`);
 }
 const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
 async function exporting(format){
  try{
   const {o,masters,meta,rows,key}=await readRun();
   $('status').textContent=`Unificando ${rows.length} eventos localmente...`;
   const compiled=unify(rows,masters,{from:o.from,to:o.to,complete:meta.complete});
   if(format==='raw'){
    const out=rawEnvelope(rows,meta,meta.last_report??{},compiled);downloadJSON(out,`INCA_UNIFICADO_STATS_V4_${stamp()}.json`);
   }else if(format==='stats')downloadJSON(compiled,`INCA_SOLO_STATS_V4_${stamp()}.json`);
   else{
    const payload={schema:'incastats.unified.checkpoint.v4',exported_at:nowIso(),config:{...o,masterTeamIds:undefined},meta,events:rows};
    downloadJSON(payload,`INCA_CHECKPOINT_V4_${stamp()}.json`);
   }
   if(meta.complete&&format==='raw'){lastDownloaded={key,to:o.to};$('confirm').disabled=false;}
   $('status').textContent=`Exportación ${format} solicitada · ${compiled.matches.length} partidos · ${compiled.player_match_stats.length} filas jugador · ${compiled.referees.length} árbitros`;
  }catch(e){log(`ERROR EXPORTACIÓN: ${e.message}`);$('status').textContent=e.message;}
 }
 $('export').onclick=()=>exporting('raw');$('stats').onclick=()=>exporting('stats');$('checkpoint').onclick=()=>exporting('checkpoint');
 $('confirm').onclick=()=>{if(!lastDownloaded)return;localStorage.setItem('inca_v4_last_confirmed_to',lastDownloaded.to);log('Confirmado hasta '+lastDownloaded.to+'. Siguiente delta puede usar 48 h de solape.');$('confirm').disabled=true;};
 $('import-checkpoint').onclick=()=>$('checkpoint-file').click();
 $('checkpoint-file').onchange=async ev=>{
  const f=ev.target.files?.[0];if(!f)return;
  try{
   const {o}=await getAdapter(),target=sessionKey(o),obj=JSON.parse(await f.text());
   let rows=[];
   if(obj.schema==='incastats.unified.checkpoint.v4'){
    rows=obj.events||[];
    if(obj.meta?.key!==target)log('Importando como HISTORIAL (otra ventana). Se unificará al exportar; no se usará para reanudar la ventana actual.');
   }else if(obj.schema==='incastats.unified.raw.v1'){
    if(Math.abs(Date.parse(obj.from)-Date.parse(o.from))>1500||Math.abs(Date.parse(obj.to)-Date.parse(o.to))>1500)log('Importando RAW de fechas distintas como HISTORIAL (sin reanudar página).');
    rows=Object.values(obj.events||{}).map(v=>({event_id:digits(v.event?.id),event:v.event,competition:v.competition,season:v.season,statistics:v.statistics,lineups:v.lineups,incidents:v.incidents,fetched:{...(v.detail?{detail:{status:'ok',at:nowIso()}}:{}),...Object.fromEntries(['statistics','lineups','incidents'].filter(k=>Object.prototype.hasOwnProperty.call(v,k)).map(k=>[k,{status:v[k]?'ok':'missing',at:nowIso()}]))}}));
   }else throw Error('Esquema desconocido. Usa CHECKPOINT V4 o RAW v1 del extractor original.');
   let imported=0;const legacy=obj.schema==='incastats.unified.raw.v1';
   const same=legacy?Math.abs(Date.parse(obj.from)-Date.parse(o.from))<=1500&&Math.abs(Date.parse(obj.to)-Date.parse(o.to))<=1500:obj.meta?.key===target;
   const prefix=same?target:`archive:${encodeURIComponent(obj.from??obj.meta?.from??'unknown')}|${encodeURIComponent(obj.to??obj.meta?.to??'unknown')}`;
   for(const item of rows){const id=digits(item?.event_id??item?.event?.id);if(!id||!item.event)continue;
    const key=prefix+':event:'+id;const old=await store.getEvent(key);
    const record={...item,key,event_id:id,errors:item.errors||[],fetched:item.fetched||{},missing:item.missing||{}};
    if(!old||Object.keys(record.fetched).length>=Object.keys(old.fetched||{}).length){await store.putEvent(record);imported++;}
   }
   if(same){const prior=await store.getMeta(target);await store.putMeta(prior??{key:target,version:VERSION,from:o.from,to:o.to,created_at:nowIso(),complete:false,last_status:'CHECKPOINT_IMPORTADO'});}
   log(`CHECKPOINT IMPORTADO: ${imported} eventos ${same?'para reanudar':'al historial acumulativo'}.`);
  }catch(e){log('IMPORT ERROR: '+e.message);}
  ev.target.value='';
 };
 $('start').onclick=async()=>{
  if(running)return;
  running=true;paused=false;stopped=false;$('pause').textContent='⏸ PAUSAR';$('start').disabled=true;
  try{
   const {o}=await getAdapter();saveUi();
   const collector=new Collector(o,{...store,wait:sleep,fetch:path=>fetch(path,{method:'GET',credentials:'same-origin',headers:{Accept:'application/json'},signal:AbortSignal.timeout(30000)}),log,stopped:()=>stopped,paused:()=>paused,
    progress:p=>{const pct=p.total?Math.round(100*p.done/p.total):0;$('bar').style.width=pct+'%';$('count').textContent=`Fase ${p.stage==='scan'?'1/2 LIGAS':'2/2 PARTIDOS'} · ${p.done}/${p.total} · ${p.requests} solicitudes · checkpoints activos`;}
   });activeCollector=collector;
   const result=await collector.run();
   $('status').textContent=`${result.meta.last_status} · ${result.report.events_discovered} eventos descubiertos · ${result.report.events_processed} procesados · ${result.requests} solicitudes · ${result.report.errors.length} errores`;
   log($('status').textContent);
   if(result.meta.complete)log('Todo procesado. Pulsa JSON UNIFICADO + RAW y luego confirma si el archivo se guardó.');
   else log('Corrida incompleta: exporta el checkpoint, revisa errores y usa el mismo rango para reanudar.');
  }catch(e){$('status').textContent='ERROR: '+e.message;log(e.stack||e.message);}
  finally{running=false;activeCollector=null;$('start').disabled=false;}
 };
 const previous=localStorage.getItem('inca_v4_last_confirmed_to');
 if(previous&&!saved.from){$('from').value=localDatetime(new Date(previous));log('Último punto confirmado restaurado: '+previous);}
 log('Checks seguros: 403 -> detener. 429 -> cooldown. Nunca expone claves privadas.');
})().catch(e=>console.error('[INCASTATS SOFA V4]',e));
})(typeof globalThis!=='undefined'?globalThis:this);
