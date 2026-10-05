'use strict';

const {requireUser}=require('./_auth');
const SUPA=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'https://jijxmshpzcoalohlhhnb.supabase.co';
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
async function rest(path){if(!SERVICE)throw new Error('SUPABASE_SERVICE_ROLE_KEY_MISSING');const r=await fetch(`${SUPA}/rest/v1/${path}`,{headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,accept:'application/json'}});if(!r.ok)throw new Error(`SUPABASE_${r.status}_${await r.text()}`);return r.json();}
function groupOdds(rows){const books=new Map();for(const r of rows||[]){const bn=r.bookmaker||'Bookmaker';if(!books.has(bn))books.set(bn,new Map());const bm=books.get(bn),mn=r.market_name||r.market_key||'Mercado';if(!bm.has(mn))bm.set(mn,[]);bm.get(mn).push({value:r.selection_raw||r.outcome_name||r.direction||'',odd:String(r.price??''),point:r.point});}return [...books].map(([name,markets])=>({name,updated:'cache',markets:[...markets].map(([name,values])=>({name,values}))}));}
function fixtureShape(r){return{id:String(r.sofascore_event_id||r.fixture_id),sofascore_event_id:Number(r.sofascore_event_id)||null,api_fixture_id:Number(r.fixture_id)||null,source:'central-cache',start_time:r.kickoff_utc,status_type:String(r.status_short||'').toLowerCase(),status_description:r.status_short||'',round:r.round||null,home:{id:Number(r.home_sofascore_team_id)||Number(r.home_api_team_id)||0,name:r.home_team_name||'',logo:r.home_logo||''},away:{id:Number(r.away_sofascore_team_id)||Number(r.away_api_team_id)||0,name:r.away_team_name||'',logo:r.away_logo||''},venue:{name:r.venue_name||'',city:r.venue_city||''},competition_id:Number(r.sofascore_competition_id)||0,season_id:null,season_name:r.season?String(r.season):''};}

module.exports=async function handler(req,res){
  const user=await requireUser(req,res);if(!user)return;
  res.setHeader('Cache-Control','private, max-age=300, stale-while-revalidate=900');
  const action=String(req.query.action||'fixtures');
  try{
    if(action==='bridge'){
      const eventId=Number(req.query.eventId)||0,fixtureId=Number(req.query.fixtureId)||0;
      if(!eventId&&!fixtureId)return res.status(200).json({ok:true,bridge:null});
      const filter=eventId?`sofascore_event_id=eq.${eventId}`:`fixture_id=eq.${fixtureId}`;
      const rows=await rest(`football_fixture_bridge?select=*&${filter}&order=confidence.desc&limit=1`).catch(()=>[]);
      const b=rows?.[0]||null;return res.status(200).json({ok:true,bridge:b,api_fixture_id:Number(b?.fixture_id)||null,sofascore_event_id:Number(b?.sofascore_event_id)||null,source:'FIXTURE_BRIDGE'});
    }
    if(action==='odds'){
      const id=Number(req.query.fixtureId)||0;if(!id)return res.status(200).json({ok:true,configured:true,bookmakers:[],source:'API-FOOTBALL'});
      const rows=await rest(`football_odds_cache?select=*&fixture_id=eq.${id}&source=eq.API-FOOTBALL&order=fetched_at.desc`);
      return res.status(200).json({ok:true,configured:true,bookmakers:groupOdds(rows),source:'API-FOOTBALL'});
    }
    if(action==='lineups'){
      const id=Number(req.query.fixtureId)||0;if(!id)return res.status(200).json({ok:true,configured:true,lineups:[],source:'CENTRAL_CACHE'});
      const rows=await rest(`football_lineups_cache?select=*&fixture_id=eq.${id}&order=updated_at.desc`);
      const payload=rows?.[0]?.payload||[];return res.status(200).json({ok:true,configured:true,lineups:Array.isArray(payload)?payload:[],updated_at:rows?.[0]?.updated_at||null,source:'CENTRAL_CACHE'});
    }
    if(action==='standings')return res.status(200).json({ok:true,standings:[],source:'TITAN_ONLY',note:'API standings disabled to protect quota'});
    if(action==='trends')return res.status(200).json({ok:true,home:null,away:null,source:'TITAN_ONLY',note:'Recent form is calculated from TITAN'});
    if(action==='fixtures'){
      const hours=Math.max(24,Math.min(336,Number(req.query.windowHours)||336)),from=new Date(Date.now()-6*3600000).toISOString(),to=new Date(Date.now()+hours*3600000).toISOString();
      const rows=await rest(`football_fixtures_cache?select=*&kickoff_utc=gte.${encodeURIComponent(from)}&kickoff_utc=lte.${encodeURIComponent(to)}&order=kickoff_utc.asc`);
      return res.status(200).json({ok:true,fixtures:(rows||[]).map(fixtureShape),source:'CENTRAL_CACHE'});
    }
    return res.status(400).json({ok:false,message:'Acción no soportada'});
  }catch(e){return res.status(200).json({ok:false,configured:true,bookmakers:[],lineups:[],fixtures:[],standings:[],source:'CENTRAL_CACHE',message:String(e.message||e)});}
};
