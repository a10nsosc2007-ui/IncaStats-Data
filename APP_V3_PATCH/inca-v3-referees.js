/* INCASTATS V3 - confirmed referee appointments, cache only, no direct scraping. */
(() => {
'use strict';
const DATA='./data/api-cache/referees_verified_v3.json';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let cache=null;
async function load(force=false){
  if(cache&&!force)return cache;
  const res=await fetch(DATA+'?v=3.0.0',{cache:force?'no-store':'default'});
  if(!res.ok)throw new Error('No hay designaciones actualizadas');
  const data=await res.json();
  if(data?.schema!=='incastats.referee_assignments.v3'||!Array.isArray(data?.events))
    throw new Error('Formato de designaciones incompatible');
  cache=data;
  return data;
}
async function get(eventId){
  try{const data=await load();return data.events.find(x=>String(x.event_id)===String(eventId))||null;}
  catch{return null;}
}
function modal(){
  let div=$('incaV3RefAssignments');
  if(div)return div;
  div=document.createElement('div');div.id='incaV3RefAssignments';div.className='inca-v3-modal';div.setAttribute('role','dialog');
  div.setAttribute('aria-modal','true');div.setAttribute('aria-label','Árbitros designados próximos partidos');
  div.innerHTML='<div class="inca-v3-dialog"><div class="inca-v3-top"><div><small>ÁRBITROS · DESIGNACIONES</small><h2>Próximos partidos</h2><p>Solo árbitros identificados en datos publicados</p></div><button id="incaV3RefClose" aria-label="Cerrar">×</button></div><div id="incaV3RefResults" class="inca-v3-output" aria-live="polite">Consultando designaciones locales…</div></div>';
  document.body.append(div);
  $('incaV3RefClose').onclick=()=>div.remove();
  div.addEventListener('click',e=>{if(e.target===div)div.remove();});
  return div;
}
async function open(){
  modal();
  const host=$('incaV3RefResults');
  try{
    const data=await load(true);
    const list=data.events.filter(x=>x.referee_name&&x.referee_confirmed===true).sort((a,b)=>String(a.kickoff_utc||'').localeCompare(String(b.kickoff_utc||'')));
    if(!list.length){
      host.innerHTML='<div class="inca-v3-empty">Sin designaciones confirmadas en el caché actual. Si el organizador aún no publicó al árbitro, se mantendrá como pendiente.</div>';
      return;
    }
    host.innerHTML='<div class="inca-v3-refs">'+list.map(x=>
      '<article><div><small>'+esc(x.kickoff_utc||'Hora pendiente')+'</small><strong>'+esc([x.home_team,x.away_team].filter(Boolean).join(' · '))+'</strong></div>'+
      '<div><small>ÁRBITRO PUBLICADO</small><strong>'+esc(x.referee_name)+'</strong><small>'+esc(x.source_label||'Fuente consultada')+'</small></div></article>'
    ).join('')+'</div><p class="inca-v3-fine">El nombramiento puede cambiar antes del partido. Fecha de consulta: '+esc(data.fetched_at_utc||'no indicada')+'.</p>';
  }catch(e){host.innerHTML='<div class="inca-v3-empty">No hay información verificable todavía. Ejecuta el sincronizador opcional antes del partido; si el proveedor bloquea la consulta, no se mostrará un nombre inventado.</div>';}
}
function mount(){
  const root=$('portalReferees');if(!root||$('incaV3RefTrigger'))return;
  const btn=document.createElement('button');btn.id='incaV3RefTrigger';btn.className='inca-v3-player-trigger';btn.type='button';
  btn.textContent='Designaciones próximas';btn.onclick=open;
  const head=root.querySelector('.portal-page-title')||root;head.append(btn);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.INCA_V3_REFEREES=Object.freeze({get,open,load});
})();