/* INCASTATS V3 - Player Rachas PRO: only actual PLAYER history, no fake prices. */
(() => {
'use strict';
const METRICS={
  shots:['Tiros_Totales','Tiros totales',1.5],
  sot:['Tiros_Al_Arco','Tiros a puerta',0.5],
  fouls:['Faltas_Cometidas','Faltas cometidas',0.5],
  fouled:['Faltas_Recibidas','Faltas recibidas',0.5],
  tackles:['Entradas_Tackles','Entradas / tackles',1.5],
  saves:['Atajadas','Atajadas',2.5],
  goals:['Goles','Goles',0.5],
  assists:['Asistencias','Asistencias',0.5],
  yellows:['Tarjetas_Amarillas','Tarjetas amarillas',0.5],
  minutes:['Minutos_Jugados','Minutos jugados',59.5],
  passes:['Pases_Totales','Pases realizados',34.5],
  passok:['Pases_Acertados','Pases acertados',29.5]
};
const $=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let manifest=null,playerMap=null,lastMatches=null;
function parseDate(x){
  if(typeof x==='number')return x;
  const m=String(x||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m?Date.UTC(+m[3],+m[2]-1,+m[1]):Date.parse(String(x||''))||0;
}
async function load(){
  if(manifest)return manifest;
  let obj=null;
  const res=await fetch('./data/player-master-2025/manifest.json?v=3.0.0',{cache:'force-cache'});
  if(res.ok)obj=await res.json();
  else throw new Error('Catálogo local de jugadores no disponible');
  const arr=Array.isArray(obj.players)?obj.players:[];
  playerMap=new Map(arr.map(x=>[String(x.id),x]));
  manifest=obj;
  return obj;
}
function playerForText(value){
  const query=String(value||'').trim();
  if(!query)return null;
  if(playerMap.has(query))return playerMap.get(query);
  const n=query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  const exact=[...playerMap.values()].find(p=>String(p.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===n);
  return exact||null;
}
async function history(p){
  const id=String(p.id);
  try{
    await window.INCA_PLAYERS?.ensureCurrentReady?.();
    const data=await window.INCA_PLAYERS?.rowsForPlayerFull?.(Number(id));
    if(Array.isArray(data)&&data.length)return data;
    const fallback=window.INCA_PLAYERS?.rowsForPlayer?.(Number(id));
    if(Array.isArray(fallback)&&fallback.length)return fallback;
  }catch(e){console.warn('[INCA V3] PLAYER HISTORICO',String(e?.message||e).slice(0,120));}
  if(!p.file)return [];
  const relative=String(p.file||'').replace(/^\/+/,'');
  if(!/^BY_PLAYER\/\d{2}\/\d+\.json$/.test(relative))return [];
  const url='https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/TITAN_PLAYERS_MASTER_2025_PLUS/'+relative;
  const response=await fetch(url,{cache:'default'});
  if(!response.ok)return [];
  const pack=await response.json();
  const fields=pack.fields||manifest?.fields||[];
  return (pack.rows||[]).map(row=>{
    if(!Array.isArray(row))return row;
    const obj={};fields.forEach((f,i)=>obj[f]=row[i]??'');return obj;
  });
}
function context(rows){
  const condition=$('incaV3Cond')?.value||'all';
  const scope=$('incaV3Comp')?.value?.trim()||'';
  return rows.filter(row=>{
    const where=String(row.Condicion||'').toLowerCase();
    if(condition==='local'&&!/(local|home)/.test(where))return false;
    if(condition==='visitante'&&!/(visita|away)/.test(where))return false;
    return !scope||String(row.Competition_ID||'')===scope;
  }).sort((a,b)=>parseDate(b.Fecha)-parseDate(a.Fecha));
}
function run(){
  const output=$('incaV3PlayerOutput');
  if(!output||!lastMatches)return;
  const metric=$('incaV3Metric')?.value||'shots',def=METRICS[metric],limit=Number($('incaV3N')?.value||10);
  const line=Number($('incaV3Line')?.value);
  if(!Number.isFinite(line)||line<0){output.textContent='Indica una línea válida.';return;}
  const rows=context(lastMatches);
  const valid=rows.filter(x=>x[def[0]]!==undefined&&x[def[0]]!==null&&String(x[def[0]]).trim()!=='');
  const sample=valid.slice(0,limit);
  if(!sample.length){
    output.innerHTML='<div class="inca-v3-empty">Sin partidos con esta métrica y este filtro. No se completarán datos faltantes con ceros.</div>';
    return;
  }
  const hits=sample.map(x=>Number(String(x[def[0]]).replace(',','.'))>line);
  const n=sample.length,count=hits.filter(Boolean).length,rate=Math.round((100*count/n)*10)/10;
  let streak=0;for(const h of hits){if(!h)break;streak++;}
  const values=sample.map(x=>Number(String(x[def[0]]).replace(',','.'))).filter(Number.isFinite);
  const mean=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
  output.innerHTML=
    '<div class="inca-v3-summary">'+
      '<div><small>Aciertos</small><strong>'+count+'/'+n+'</strong></div>'+
      '<div><small>Frecuencia histórica</small><strong>'+rate.toFixed(1)+'%</strong></div>'+
      '<div><small>Racha consecutiva</small><strong>'+streak+'</strong></div>'+
      '<div><small>Promedio</small><strong>'+(mean===null?'—':mean.toFixed(2))+'</strong></div>'+
    '</div>'+
    '<div class="inca-v3-dots" aria-label="Resultados de los últimos partidos">'+
      hits.map((h,i)=>'<span class="'+(h?'hit':'miss')+'" title="'+safe(sample[i].Fecha)+' · '+safe(sample[i][def[0]])+'">'+(h?'✓':'×')+'</span>').join('')+
    '</div>'+
    '<p class="inca-v3-fine">Cuota real: <b>no publicada para esta selección</b>. Esta es una racha estadística, no una probabilidad garantizada. Partido, rival y línea deben coincidir con una cotización vigente.</p>';
}
function close(){$('incaV3PlayerDialog')?.remove();}
async function open(){
  let dialog=$('incaV3PlayerDialog');
  if(!dialog){
    dialog=document.createElement('div');dialog.id='incaV3PlayerDialog';dialog.className='inca-v3-modal';dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Rachas de jugadores');
    dialog.innerHTML=
      '<div class="inca-v3-dialog">'+
        '<div class="inca-v3-top"><div><small>PLAYER STREAKS</small><h2>Rachas de jugadores</h2><p>Partidos históricos verificados por jugador y competición</p></div><button id="incaV3Close" type="button" aria-label="Cerrar">×</button></div>'+
        '<div class="inca-v3-inputs">'+
          '<label class="wide">Jugador <input id="incaV3Player" placeholder="Nombre exacto o ID SofaScore" type="search" autocomplete="off"><datalist id="incaV3Names"></datalist></label>'+
          '<label>Métrica <select id="incaV3Metric">'+Object.entries(METRICS).map(([k,v])=>'<option value="'+k+'">'+safe(v[1])+'</option>').join('')+'</select></label>'+
          '<label>Línea superior a <input id="incaV3Line" type="number" value="1.5" min="0" step="0.5"></label>'+
          '<label>Últimos partidos <select id="incaV3N"><option>5</option><option selected>10</option><option>15</option><option>20</option></select></label>'+
          '<label>Condición <select id="incaV3Cond"><option value="all">Todas</option><option value="local">Local</option><option value="visitante">Visitante</option></select></label>'+
          '<label>Competición (ID opcional) <input id="incaV3Comp" placeholder="Todas" inputmode="numeric"></label>'+
        '</div><button id="incaV3Run" type="button" class="inca-v3-action">Analizar racha</button>'+
        '<div id="incaV3PlayerOutput" aria-live="polite" class="inca-v3-output"></div>'+
      '</div>';
    document.body.append(dialog);
    $('incaV3Close').addEventListener('click',close);
    dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')close();},{once:true});
    $('incaV3Metric').addEventListener('change',e=>{$('incaV3Line').value=METRICS[e.target.value][2];if(lastMatches)run();});
    ['incaV3N','incaV3Cond','incaV3Line','incaV3Comp'].forEach(x=>$(x).addEventListener('change',run));
    $('incaV3Player').addEventListener('input',e=>{
      if(!playerMap)return;
      const q=e.target.value.toLowerCase().trim();
      const datalist=$('incaV3Names');if(q.length<2){datalist.innerHTML='';return;}
      const results=[];
      for(const p of playerMap.values()){
        if(String(p.name||'').toLowerCase().includes(q)||String(p.id||'')===q){
          results.push(p);if(results.length>=12)break;
        }
      }
      datalist.innerHTML=results.map(p=>'<option value="'+safe(p.name)+'"></option>').join('');
    });
    $('incaV3Player').setAttribute('list','incaV3Names');
    $('incaV3Run').addEventListener('click',async()=>{
      const out=$('incaV3PlayerOutput');
      const meta=playerForText($('incaV3Player').value);
      if(!meta){out.textContent='Selecciona un jugador del catálogo o escribe su ID.';return;}
      out.textContent='Consultando historial...';
      try{lastMatches=await history(meta);run();}
      catch(e){out.textContent='No se pudo leer el histórico de este jugador.';console.warn('[INCA V3] Jugador:',e?.message);}
    });
  }
  lastMatches=null;
  $('incaV3PlayerOutput').textContent='Escribe al menos dos letras para buscar jugadores del catálogo.';
  try{await load();}
  catch(e){$('incaV3PlayerOutput').textContent='No se pudo cargar el catálogo de jugadores.';console.warn('[INCA V3]',e?.message);}
  $('incaV3Player').focus();
}
function mount(){
  const root=$('portalPlayers');
  if(!root||$('incaV3PlayerStreaksButton'))return;
  const button=document.createElement('button');
  button.id='incaV3PlayerStreaksButton';button.type='button';button.className='inca-v3-player-trigger';
  button.textContent='Rachas de jugadores';
  button.addEventListener('click',open);
  const heading=root.querySelector('.portal-page-title')||root;
  heading.append(button);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.INCA_V3_PLAYER_STREAKS=Object.freeze({open,version:'3.0.0-rescate'});
})();