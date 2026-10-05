'use strict';

const {requireUser}=require('./_auth');
const FOOT=require('./_football-provider');
const SUPA=FOOT.SUPA,SERVICE=FOOT.SERVICE;
async function rest(path){if(!SERVICE)throw new Error('SUPABASE_SERVICE_ROLE_KEY_MISSING');const r=await fetch(`${SUPA}/rest/v1/${path}`,{headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,accept:'application/json'}});if(!r.ok)throw new Error(`SUPABASE_${r.status}_${await r.text()}`);return r.json();}
module.exports=async function handler(req,res){
  const user=await requireUser(req,res);if(!user)return;
  res.setHeader('Cache-Control','private, max-age=300, stale-while-revalidate=900');
  try{
    const action=String(req.query.action||'fixtures');
    if(action==='status'){
      const day=new Date().toISOString().slice(0,10);
      const [sync,usage,keys]=await Promise.all([
        rest('football_sync_state?select=*&job_name=eq.inca_v1043_pro_sync&limit=1').catch(()=>[]),
        rest(`football_api_usage_daily?select=*&day=eq.${day}&limit=1`).catch(()=>[]),
        rest('football_api_key_state?select=key_alias,enabled,monthly_limit,month_key,month_used,day_key,day_used,last_used_at,last_status,last_remaining,cooldown_until&provider=eq.api-football&order=key_alias.asc').catch(()=>[])
      ]);
      const s=sync?.[0]||{},u=usage?.[0]||{},active=(keys||[]).filter(k=>k.enabled);
      return res.status(200).json({ok:true,status:s.status||'pending',last_success_at:s.last_success_at||null,meta:s.meta||{},requests_today:Number(u.used||0),api_pool:{...FOOT.publicConfig(),tracked_keys:active.length,month_used:active.reduce((a,k)=>a+Number(k.month_used||0),0),day_used:active.reduce((a,k)=>a+Number(k.day_used||0),0),cooling_down:active.filter(k=>k.cooldown_until&&new Date(k.cooldown_until)>new Date()).length},mode:'CACHE_ONLY'});
    }
    if(action==='bridge'){
      const event=Number(req.query.event)||0,fixture=Number(req.query.fixture)||0;if(!event&&!fixture)return res.status(200).json({ok:true,bridge:null});
      const q=event?`football_fixture_bridge?select=*&sofascore_event_id=eq.${event}&order=confidence.desc&limit=1`:`football_fixture_bridge?select=*&fixture_id=eq.${fixture}&limit=1`;
      const data=await rest(q).catch(()=>[]);return res.status(200).json({ok:true,bridge:data?.[0]||null,source:'CENTRAL_CACHE'});
    }
    if(action==='teams'){const data=await rest('football_current_teams?select=*&is_current=eq.true&order=league_name.asc,team_name.asc').catch(()=>[]);return res.status(200).json({ok:true,teams:data||[]});}
    if(action==='fixtures'){
      const hours=Math.max(24,Math.min(336,Number(req.query.hours)||336)),from=new Date(Date.now()-6*3600000).toISOString(),to=new Date(Date.now()+hours*3600000).toISOString();
      const data=await rest(`football_fixtures_cache?select=*&kickoff_utc=gte.${encodeURIComponent(from)}&kickoff_utc=lte.${encodeURIComponent(to)}&order=kickoff_utc.asc`);return res.status(200).json({ok:true,fixtures:data||[],hours,source:'CENTRAL_CACHE'});
    }
    if(action==='markets'){
      const from=new Date(Date.now()-7*86400000).toISOString(),source=String(req.query.source||'').trim();let q=`football_market_availability_cache?select=*&discovered_at=gte.${encodeURIComponent(from)}`;if(source)q+=`&source=eq.${encodeURIComponent(source)}`;q+='&order=discovered_at.desc';
      const data=await rest(q).catch(()=>[]);return res.status(200).json({ok:true,markets:data||[]});
    }
    if(action==='odds'){
      const fixture=Number(req.query.fixture)||0,source=String(req.query.source||'').trim(),sourceFilter=source?`&source=eq.${encodeURIComponent(source)}`:'';
      if(fixture){const data=await rest(`football_odds_cache?select=*&fixture_id=eq.${fixture}${sourceFilter}&order=fetched_at.desc`);return res.status(200).json({ok:true,odds:data||[],source:'CENTRAL_CACHE'});}
      const hours=Math.max(24,Math.min(336,Number(req.query.hours)||336)),from=new Date(Date.now()-6*3600000).toISOString(),to=new Date(Date.now()+hours*3600000).toISOString();const data=await rest(`football_odds_cache?select=*&kickoff_utc=gte.${encodeURIComponent(from)}&kickoff_utc=lte.${encodeURIComponent(to)}${sourceFilter}&order=kickoff_utc.asc`);return res.status(200).json({ok:true,odds:data||[],hours,source:'CENTRAL_CACHE'});
    }
    if(action==='referees'){
      const comp=Number(req.query.competition)||0,hours=Math.max(24,Math.min(336,Number(req.query.hours)||336)),from=new Date(Date.now()-7*86400000).toISOString(),to=new Date(Date.now()+hours*3600000).toISOString();const filters=[`kickoff_utc=gte.${encodeURIComponent(from)}`,`kickoff_utc=lte.${encodeURIComponent(to)}`];if(comp>0)filters.push(`sofascore_competition_id=eq.${comp}`);const data=await rest(`football_referee_assignments_cache?select=*&${filters.join('&')}&order=kickoff_utc.asc`);return res.status(200).json({ok:true,referees:data||[],competition:comp||null,source:'CENTRAL_CACHE'});
    }
    if(action==='referee-history'){
      const name=String(req.query.referee||'').trim(),limit=Math.max(1,Math.min(200,Number(req.query.limit)||200));if(!name)return res.status(200).json({ok:true,matches:[],source:'CENTRAL_CACHE'});
      const data=await rest(`football_referee_assignments_cache?select=*&referee=ilike.${encodeURIComponent('*'+name+'*')}&order=kickoff_utc.desc&limit=${limit}`).catch(()=>[]);
      const matches=(data||[]).map(r=>({fixture_id:r.fixture_id,date_iso:r.kickoff_utc,competition_name:r.league_name,home_team:r.home_team_name,away_team:r.away_team_name,referee:r.referee,status_short:r.status_short}));
      return res.status(200).json({ok:true,matches,source:'CENTRAL_CACHE'});
    }
    if(action==='playerprops'){
      const hours=Math.max(24,Math.min(336,Number(req.query.hours)||336)),from=new Date(Date.now()-6*3600000).toISOString(),to=new Date(Date.now()+hours*3600000).toISOString(),source=String(req.query.source||'').trim(),sourceFilter=source?`&source=eq.${encodeURIComponent(source)}`:'';const data=await rest(`football_player_props_cache?select=*&kickoff_utc=gte.${encodeURIComponent(from)}&kickoff_utc=lte.${encodeURIComponent(to)}${sourceFilter}&order=kickoff_utc.asc`);return res.status(200).json({ok:true,playerprops:data||[],hours,source:'CENTRAL_CACHE'});
    }
    if(action==='lineups'){const fixture=Number(req.query.fixture)||0,q=fixture?`football_lineups_cache?select=*&fixture_id=eq.${fixture}&order=updated_at.desc`:'football_lineups_cache?select=*&order=updated_at.desc&limit=50';const data=await rest(q).catch(()=>[]);return res.status(200).json({ok:true,lineups:data||[],source:'CENTRAL_CACHE'});}
    return res.status(400).json({ok:false,code:'ACTION_INVALID'});
  }catch(e){return res.status(200).json({ok:false,teams:[],fixtures:[],odds:[],markets:[],playerprops:[],referees:[],lineups:[],message:String(e.message||e)});}
};
