'use strict';
/** QA local sin red. Crea un proyecto temporal, nunca modifica los masters del usuario. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const source=path.resolve(__dirname,'../..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'inca-v4-qa-'));
const cp=(name)=>{const dst=path.join(temp,name);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(source,name),dst);};
const checks=[];const check=(name,fn)=>{fn();checks.push(name);console.log('[OK]',name);};
const run=(file,extra=[])=>spawnSync(process.execPath,[path.join(temp,'tools/unified/sync.cjs'),file,...extra],{encoding:'utf8',maxBuffer:8*1024*1024});
const put=(name,data)=>{const p=path.join(temp,name);fs.writeFileSync(p,JSON.stringify(data));return p;};
const hash=(p)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
try{
 for(const file of ['EXTRACTOR_UNICO_SOFA.js','tools/unified/sync.cjs','ENTRADAS_MASTERS/MASTER_TEAMS_ACTUALIZADO.json','ENTRADAS_MASTERS/MASTER_PLAYERS_ACTUALIZADO.json','ENTRADAS_MASTERS/03_ARBITROS.json'])cp(file);
 const event={id:12345678,startTimestamp:1793563200,status:{type:'finished'},tournament:{uniqueTournament:{id:17,name:'Premier League'}},season:{id:2026,name:'26/27'},homeTeam:{id:2311,name:'Alianza Lima'},awayTeam:{id:2692,name:'AC Milan'},homeScore:{display:2},awayScore:{display:1},referee:{id:52183,name:'Deniz Aytekin'}};
 const stats={statistics:[{period:'ALL',groups:[{statisticsItems:[{name:'Total shots',home:15,away:8},{name:'Shots on target',home:5,away:3},{name:'Yellow cards',home:2,away:3}]}]}]};
 const lineups={home:{players:[{player:{id:338,name:'Paolo Guerrero'},statistics:{minutesPlayed:90,totalShots:4,onTargetScoringAttempt:2}}]},away:{players:[]}};
 const row={event,detail:true,done:true,competition:{id:17,name:'Premier League'},season:{id:2026,name:'26/27'},statistics:stats,lineups,incidents:{incidents:[]}};
 const envelope=rows=>({schema:'incastats.unified.raw.v1',schema_version:'incastats.unified.stats.v4',from:'2026-11-01T00:00:00.000Z',to:'2026-11-03T23:00:00.000Z',complete:true,events:Object.fromEntries(rows.map(r=>[String(r.event.id),r]))});
 const f1=put('uno.json',envelope([row]));
 let r=run(f1,['--check']);check('Precheck válido, sin escritura',()=>{assert.equal(r.status,0,r.stderr);assert.equal(fs.existsSync(path.join(temp,'data','unified')),false);});
 r=run(f1);check('Importación inicial',()=>{assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/1 partidos/);});
 const main=path.join(temp,'data','unified','INCA_UNIFICADO_STATS_MASTER_V4.json');
 const statsFile=path.join(temp,'data','unified','INCA_SOLO_STATS_MASTER_V4.json');
 check('Registros completos equipos-jugadores-árbitros',()=>{const d=JSON.parse(fs.readFileSync(statsFile));assert.equal(d.matches.length,1);assert.equal(d.team_match_stats.length,2);assert.equal(d.player_match_stats.length,1);assert.equal(d.referees.length,982);assert.equal(d.matches[0].referee_id,52183);});
 const h0=hash(main);r=run(f1);check('Reimportar no duplica ni reescribe',()=>{assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/SIN CAMBIOS/);assert.equal(hash(main),h0);});
 const event2={...event,id:12345679,startTimestamp:1793650000,homeTeam:{id:2692,name:'AC Milan'},awayTeam:{id:2311,name:'Alianza Lima'},referee:undefined,homeScore:{display:0},awayScore:{display:1}};
 const row2={...row,event:event2,lineups:null,statistics:{statistics:[{period:'ALL',groups:[{statisticsItems:[{name:'Total shots',home:9,away:11}]}]}]},incidents:{incidents:[]}};
 const f2=put('dos.json',envelope([row2]));
 r=run(f2,['--check']);check('Precheck de segundo partido mantiene histórico',()=>{assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/Total consolidado: 2/);assert.equal(hash(main),h0);});
 r=run(f2);check('Upsert e historial permanente',()=>{assert.equal(r.status,0,r.stderr);const d=JSON.parse(fs.readFileSync(main));assert.equal(Object.keys(d.events).length,2);assert.equal(d.unified.matches.length,2);assert.equal(d.unified.player_match_stats.length,1);});
 const backupPath=path.join(temp,'.backups','unified');check('Copia de seguridad automática',()=>{assert.ok(fs.readdirSync(backupPath).length>0);});
 const h1=hash(main);
 const damaged=put('danado.json',{schema:'incastats.unified.stats.v4',matches:[{event_id:5}]});r=run(damaged);check('Rechaza SOLO STATS y formatos desconocidos',()=>{assert.notEqual(r.status,0);assert.equal(hash(main),h1);});
 const incomplete=put('incompleto.json',{...envelope([row]),complete:false});r=run(incomplete);check('Rechaza extracciones incompletas',()=>{assert.notEqual(r.status,0);assert.equal(hash(main),h1);});
 const conflict=put('conflicto.json',envelope([{...row,event:{...event,awayTeam:{id:2977,name:'Heracles Almelo'}}}]));r=run(conflict,['--check']);check('Rechaza un Event_ID con equipos incompatibles',()=>{assert.notEqual(r.status,0);assert.equal(hash(main),h1);});
 const teamMaster=path.join(temp,'ENTRADAS_MASTERS','MASTER_TEAMS_ACTUALIZADO.json');const masterHash=hash(teamMaster);r=run(f1);check('Nunca modifica los masters originales',()=>{assert.equal(r.status,0,r.stderr);assert.equal(hash(teamMaster),masterHash);});
 console.log(`\n${checks.length}/${checks.length} PRUEBAS OK · sin solicitudes de red · datos sintéticos`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
