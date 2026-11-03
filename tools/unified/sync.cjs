#!/usr/bin/env node
'use strict';
/* INCASTATS V4: sincronizador LOCAL. Sin API, sin secretos, sin GitHub y sin borrar históricos.
 * Combinación por Event_ID, preservando endpoints ricos. Solo modifica data/unified/.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {unify,SCHEMA}=require('../../EXTRACTOR_UNICO_SOFA.js');
const ROOT=path.resolve(__dirname,'../..');
const OUT_DIR=path.join(ROOT,'data','unified');
const BAK_DIR=path.join(ROOT,'.backups','unified');
const MAIN='INCA_UNIFICADO_STATS_MASTER_V4.json';
const STATS='INCA_SOLO_STATS_MASTER_V4.json';
const MANIFEST='manifest.json';
const FILE_LIMIT=1024*1024*1024;
function fail(message){throw Error(message);}
function goodObj(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
function posId(id){const v=Number(id);return Number.isSafeInteger(v)&&v>0?v:null;}
function safeRead(file){if(!fs.existsSync(file))return null;if(fs.lstatSync(file).isSymbolicLink())fail('Archivo enlazado no permitido: '+file);const stat=fs.statSync(file);if(!stat.isFile()||stat.size>FILE_LIMIT)fail('Archivo no válido o excesivamente grande: '+file);let v;try{v=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){fail('JSON inválido '+path.basename(file)+': '+e.message);}return v;}
function sha(x){return crypto.createHash('sha256').update(x).digest('hex');}
function isFilled(x){return x!==null&&x!==undefined&&x!=='';}
function contentScore(x){if(x===null||x===undefined)return -1;if(Array.isArray(x))return x.length>0?100+x.length:0;if(goodObj(x)){if(x.__missing)return 0;const a=Object.values(x);return a.length?a.reduce((n,v)=>n+(Array.isArray(v)?v.length+1:goodObj(v)?Object.keys(v).length+1:isFilled(v)?1:0),0):0;}return 0;}
function infoScore(e){if(!goodObj(e))return 0;let s=Object.keys(e).length;
  if(e.referee||e.referees)s+=12;if(e.venue)s+=6;if(e.homeScore||e.awayScore)s+=6;if(e.status?.type==='finished')s+=20;return s;}
function mergeRichObj(oldVal,newVal){if(!goodObj(oldVal))return newVal??oldVal;if(!goodObj(newVal))return oldVal;
  const out={...oldVal};for(const [k,v] of Object.entries(newVal)){
    if(!isFilled(v))continue;
    if(goodObj(v)&&goodObj(out[k]))out[k]=mergeRichObj(out[k],v);
    else if(Array.isArray(v)){if(v.length)out[k]=v;}
    else out[k]=v;
  }return out;}
function normalizeRows(raw,source){
 if(raw?.schema!=='incastats.unified.raw.v1'||raw?.schema_version!==SCHEMA||!goodObj(raw.events))fail(`${source}: se requiere JSON UNIFICADO + RAW V4 (NO SOLO STATS ni CHECKPOINT)`);
 const keys=Object.keys(raw.events);if(!keys.length)fail(`${source}: events está vacío; no se sincroniza nada`);
 if(keys.length>500000)fail(`${source}: demasiados eventos en un único JSON`);
 const map=new Map();
 for(const [key,row] of Object.entries(raw.events)){
  const id=posId(key);if(!id||!goodObj(row)||!goodObj(row.event)||posId(row.event.id)!==id)fail(`${source}: Event_ID inconsistente o sin evento: ${key}`);
  const a=posId(row.event.homeTeam?.id),b=posId(row.event.awayTeam?.id);
  if(!a||!b||a===b)fail(`${source}: fixture ${id} no tiene equipos válidos y distintos`);
  const ts=Number(row.event.startTimestamp);if(!Number.isSafeInteger(ts)||ts<946684800||ts>4102444800)fail(`${source}: fixture ${id} tiene fecha inválida`);
  map.set(String(id),row);
 }return map;
}
function bestEndpoint(o,n){return contentScore(n)>=contentScore(o)&&contentScore(n)>0?n:(isFilled(o)?o:(isFilled(n)?n:null));}
function mergeMatch(oldRow,newRow){
 if(!oldRow)return newRow;
 const old=oldRow.event, fresh=newRow.event, id=old.id;
 if(posId(old.homeTeam?.id)!==posId(fresh.homeTeam?.id)||posId(old.awayTeam?.id)!==posId(fresh.awayTeam?.id))fail(`CONFLICTO CRÍTICO fixture ${id}: cambió la identidad local/visitante; no se sobrescribe.`);
 if(posId(old.tournament?.uniqueTournament?.id)&&posId(fresh.tournament?.uniqueTournament?.id)&&posId(old.tournament.uniqueTournament.id)!==posId(fresh.tournament.uniqueTournament.id))fail(`CONFLICTO CRÍTICO fixture ${id}: ID de competición incompatible.`);
 const oldFinished=old.status?.type==='finished',newFinished=fresh.status?.type==='finished';
 const common=mergeRichObj(old,newFinished||!oldFinished?fresh:{});
 // Si el evento anterior está finalizado y el nuevo no, conservar resultado/estado.
 if(oldFinished&&!newFinished){common.status=old.status;common.homeScore=old.homeScore;common.awayScore=old.awayScore;}
 const o=infoScore(old),n=infoScore(fresh);
 const e=o>n?mergeRichObj(fresh,common):common;
 for(const field of ['referee','referees','venue'])if(!isFilled(e[field])&&isFilled(old[field]))e[field]=old[field];
 return {
   ...oldRow,...newRow,event:e,
   competition:newRow.competition??oldRow.competition,
   season:newRow.season??oldRow.season,
   statistics:bestEndpoint(oldRow.statistics,newRow.statistics),
   lineups:bestEndpoint(oldRow.lineups,newRow.lineups),
   incidents:bestEndpoint(oldRow.incidents,newRow.incidents),
   detail:Boolean(oldRow.detail||newRow.detail),
   done:Boolean(oldRow.done||newRow.done),
 };
}
function ensureMasterFile(name,arr,schema){const f=path.join(ROOT,'ENTRADAS_MASTERS',name);const raw=safeRead(f);if(!raw)fail(`Falta ENTRADAS_MASTERS/${name}. No se modificó nada.`);if(!Array.isArray(raw[arr]))fail(`${name}: falta ${arr}[]`);if(raw[arr].length<1)fail(`${name}: master vacío`);if(schema&&!(raw.schema_version===schema||raw.schema===schema))fail(`${name}: esquema inesperado`);const ids=new Set();for(const item of raw[arr]){const id=posId(arr==='teams'?item.team_id??item.id:arr==='players'?item.id??item.player_id:item.referee_id??item.id);if(!id||ids.has(id))fail(`${name}: ID inválido o duplicado (${id||'NULL'})`);ids.add(id);}return raw;}
function loadMasters(){return {
 teams:ensureMasterFile('MASTER_TEAMS_ACTUALIZADO.json','teams','incastats.uefa.base.teams.v1'),
 players:ensureMasterFile('MASTER_PLAYERS_ACTUALIZADO.json','players','incastats.player_selection.v1'),
 referees:ensureMasterFile('03_ARBITROS.json','referees','incastats.unified_selection.referees.v2'),
};}
function readArguments(argv){if(!argv.length)fail('Arrastra un INCA_UNIFICADO_STATS_V4_*.json sobre el BAT o indica su ruta.');let input=null,check=false,allowIncomplete=false;for(const arg of argv){if(arg==='--check')check=true;else if(arg==='--allow-incomplete')allowIncomplete=true;else if(arg.startsWith('--'))fail('Opción desconocida: '+arg);else if(input)fail('Solo se admite un archivo por ejecución.');else input=path.resolve(arg);}if(!input)fail('Falta un archivo de entrada.');return {input,check,allowIncomplete};}
function writeAtomicBundle(changes){
 for(const name of changes.keys())if(![MAIN,STATS,MANIFEST].includes(name))fail('Ruta de salida no permitida');
 if(fs.existsSync(OUT_DIR)&&fs.lstatSync(OUT_DIR).isSymbolicLink())fail('Directorio de salida enlazado: operación bloqueada');
 if(fs.existsSync(path.dirname(OUT_DIR))&&fs.lstatSync(path.dirname(OUT_DIR)).isSymbolicLink())fail('Directorio padre enlazado: operación bloqueada');
 fs.mkdirSync(OUT_DIR,{recursive:true});
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');const temp=[];const old=[];let success=false;
 try{
  // Serializar y escribir TODOS los temporales antes de reemplazar cualquier archivo.
  for(const [name,contents] of changes){const dst=path.join(OUT_DIR,name);if(fs.existsSync(dst)&&fs.lstatSync(dst).isSymbolicLink())fail('Archivo destino enlazado: '+name);
   const tmp=path.join(OUT_DIR,`.tmp_${process.pid}_${name}`);fs.writeFileSync(tmp,contents,{flag:'wx'});temp.push([tmp,dst]);}
  const exists=temp.filter(([,dst])=>fs.existsSync(dst));if(exists.length){fs.mkdirSync(path.join(BAK_DIR,stamp),{recursive:true});for(const [,dst] of exists){const backup=path.join(BAK_DIR,stamp,path.basename(dst));fs.copyFileSync(dst,backup,fs.constants.COPYFILE_EXCL);old.push([dst,backup]);}}
  let replaced=0;
  try{for(const [tmp,dst] of temp){fs.renameSync(tmp,dst);replaced++;}}catch(e){
   for(let i=0;i<replaced;i++){const dst=temp[i][1],prior=old.find(([p])=>p===dst);if(prior)fs.copyFileSync(prior[1],dst);else fs.rmSync(dst,{force:true});}throw e;
  }
  success=true;return {backup:old.length?path.join(BAK_DIR,stamp):null};
 }finally{if(!success)for(const [tmp] of temp)try{fs.rmSync(tmp,{force:true});}catch{}}
}
function sync(args){const cfg=readArguments(args),input=safeRead(cfg.input);if(!input)fail('Archivo no encontrado: '+cfg.input);
 if(!cfg.allowIncomplete&&input.complete!==true)fail('La extracción está INCOMPLETA. Reanúdala en SofaScore y exporta JSON UNIFICADO + RAW al completarla.');
 const incoming=normalizeRows(input,'Entrada');const masters=loadMasters();
 const masterFiles=['MASTER_TEAMS_ACTUALIZADO.json','MASTER_PLAYERS_ACTUALIZADO.json','03_ARBITROS.json'];
 const masterHash=sha(masterFiles.map(n=>fs.readFileSync(path.join(ROOT,'ENTRADAS_MASTERS',n))).reduce((a,b)=>a+b.toString('utf8'),'')).slice(0,24);
 const oldFile=path.join(OUT_DIR,MAIN);const oldRaw=safeRead(oldFile);
 let previous=new Map();if(oldRaw){previous=normalizeRows(oldRaw,'Histórico consolidado');}
 const merged=new Map(previous);
 let added=0,updated=0,retained=0;
 for(const [id,row] of incoming){if(!merged.has(id)){merged.set(id,row);added++;}else{const old=merged.get(id),replacement=mergeMatch(old,row);merged.set(id,replacement);if(JSON.stringify(replacement)===JSON.stringify(old))retained++;else updated++;}}
 const entries=[...merged.entries()].sort((a,b)=>Number(a[0])-Number(b[0]));
 const events=Object.fromEntries(entries);const hash=sha(JSON.stringify(events));
 const prevManifest=safeRead(path.join(OUT_DIR,MANIFEST));
 const unchanged=prevManifest?.events_sha256===hash&&prevManifest?.master_sha256===masterHash&&fs.existsSync(path.join(OUT_DIR,STATS));
 const lines=[`Entrada: ${path.basename(cfg.input)}`,`Eventos del archivo: ${incoming.size}`,`Histórico previo: ${previous.size}`,`Nuevos: ${added} · Coincidentes: ${updated+retained}`,`Total consolidado: ${merged.size}`,`Masters: ${masters.teams.teams.length} equipos / ${masters.players.players.length} jugadores / ${masters.referees.referees.length} árbitros`, `Destino: ${OUT_DIR}`];
 for(const l of lines)console.log(l);
 if(cfg.check){console.log(unchanged?'PRECHECK OK: sin cambios desde la última importación.':'PRECHECK OK: listo para actualizar sin borrar los históricos.');return {dryRun:true,added,total:merged.size,unchanged};}
 if(unchanged){console.log('SIN CAMBIOS: el fichero ya está incorporado; no se reescribieron archivos.');return {added:0,total:merged.size,unchanged:true};}
 const rows=entries.map(([_,v])=>({...v, fetched:{detail:{status:v.detail?'ok':'missing'},statistics:{status:v.statistics?'ok':'missing'},lineups:{status:v.lineups?'ok':'missing'},incidents:{status:v.incidents?'ok':'missing'}}}));
 let first=Infinity,last=-Infinity;for(const [,v] of entries){const t=Number(v.event.startTimestamp);if(t<first)first=t;if(t>last)last=t;}
 const compiled=unify(rows,masters,{from:entries.length?new Date(first*1000).toISOString():null,to:entries.length?new Date(last*1000).toISOString():null,complete:input.complete===true});
 if(!compiled?.metadata||!Array.isArray(compiled.matches)||!Array.isArray(compiled.players)||!Array.isArray(compiled.referees))fail('Salida estadística inválida: operación cancelada.');
 if(compiled.matches.length>entries.length)fail('Integridad inválida: más partidos que IDs.');
 const result={schema:'incastats.unified.raw.v1',schema_version:SCHEMA,from:input.from??oldRaw?.from??null,to:input.to??oldRaw?.to??null,created_at:oldRaw?.created_at??new Date().toISOString(),completed_at:new Date().toISOString(),complete:input.complete===true&&oldRaw?.complete!==false,requests:0,events,scans:{},errors:[],unified:compiled};
 const manifest={schema:'incastats.local.unified.v4',generated_at:new Date().toISOString(),source:'local_v4_sync',events_sha256:hash,master_sha256:masterHash,stats_file:STATS,raw_file:MAIN,counts:compiled.metadata.counts,source_events:incoming.size,total_events:merged.size,warning:'Estos archivos son una base INDEPENDIENTE. Las pantallas V3 existentes no consumen automáticamente data/unified; adaptar lector de la app por separado si se desea.'};
 const output=new Map([[MAIN,JSON.stringify(result)],[STATS,JSON.stringify(compiled)],[MANIFEST,JSON.stringify(manifest,null,2)+'\n']]);
 const {backup}=writeAtomicBundle(output);
 console.log('ACTUALIZACIÓN CORRECTA: '+compiled.matches.length+' partidos, '+compiled.player_match_stats.length+' filas de jugadores, '+compiled.referees.length+' árbitros catalogados, '+(compiled.metadata.counts.with_referee||0)+' partidos con árbitro identificado.');
 console.log('Sincronización local: '+path.join(OUT_DIR,MANIFEST));if(backup)console.log('Respaldo: '+backup);
 console.log('IMPORTANTE: se creó base unificada V4; NO se alteraron módulos heredados de IncaStats V3.');
 return {added,total:merged.size,backup,counts:compiled.metadata.counts};
}
if(require.main===module){try{sync(process.argv.slice(2));}catch(e){console.error('ERROR DE SINCRONIZACIÓN:',e.message);process.exitCode=1;}}
module.exports={sync,mergeMatch,normalizeRows};
