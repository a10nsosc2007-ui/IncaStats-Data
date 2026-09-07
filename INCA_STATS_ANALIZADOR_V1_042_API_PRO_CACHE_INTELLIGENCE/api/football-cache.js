
const {requireUser}=require('./_auth');
const SUPA=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'https://jijxmshpzcoalohlhhnb.supabase.co';
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
async function rest(path){
  if(!SERVICE)throw new Error('SUPABASE_SERVICE_ROLE_KEY_MISSING');
  const r=await fetch(`${SUPA}/rest/v1/${path}`,{headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,accept:'application/json'}});
  if(!r.ok)throw new Error(`SUPABASE_${r.status}_${await r.text()}`);return r.json();
}
module.exports=async function handler(req,res){
  const user=await requireUser(req,res);if(!user)return;
  res.setHeader('Cache-Control','private, max-age=300, stale-while-revalidate=900');
  try{
    const action=String(req.query.action||'fixtures');
    if(action==='status'){
      const [sync,usage]=await Promise.all([
        rest('football_sync_state?select=*&job_name=eq.inca_v1042_pro_sync&limit=1'),
        rest(`football_api_usage_daily?select=*&day=eq.${new Date().toISOString().slice(0,10)}&limit=1`).catch(()=>[])
      ]);
      const s=sync?.[0]||{},u=usage?.[0]||{};
      return res.status(200).json({ok:true,status:s.status||'pending',last_success_at:s.last_success_at||null,meta:s.meta||{},requests_today:Number(u.used||0),mode:'CACHE_ONLY'});
    }
    if(action==='teams'){
      const data=await rest('football_current_teams?select=*&is_current=eq.true&order=league_name.asc,team_name.asc').catch(()=>[]);
      return res.status(200).json({ok:true,teams:data||[]});
    }
    if(action==='fixtures'){
      const hours=Math.max(24,Math.min(336,Number(req.query.hours)||336));
      const from=new Date(Date.now()-6*3600000).toISOString(),to=new Date(Date.now()+hours*3600000).toISOString();
      const data=await rest(`football_fixtures_cache?select=*&kickoff_utc=gte.${encodeURIComponent(from)}&kickoff_utc=lte.${encodeURIComponent(to)}&order=kickoff_utc.asc`);
      return res.status(200).json({ok:true,fixtures:data||[],hours,source:'CENTRAL_CACHE'});
    }
    if(action==='markets'){
      const from=new Date(Date.now()-7*86400000).toISOString();
      const data=await rest(`football_market_availability_cache?select=*&discovered_at=gte.${encodeURIComponent(from)}&order=discovered_at.desc`).catch(()=>[]);
      return res.status(200).json({ok:true,markets:data||[]});
    }
    if(action==='odds'){
      const fixture=Number(req.query.fixture)||0;
      if(fixture){
        const data=await rest(`football_odds_cache?select=*&fixture_id=eq.${fixture}&order=fetched_at.desc`);
        return res.status(200).json({ok:true,odds:data||[],source:'CENTRAL_CACHE'});
      }
      const hours=Math.max(24,Math.min(336,Number(req.query.hours)||336));
      const from=new Date(Date.now()-6*3600000).toISOString(),to=new Date(Date.now()+hours*3600000).toISOString();
      const data=await rest(`football_odds_cache?select=*&kickoff_utc=gte.${encodeURIComponent(from)}&kickoff_utc=lte.${encodeURIComponent(to)}&order=kickoff_utc.asc`);
      return res.status(200).json({ok:true,odds:data||[],hours,source:'CENTRAL_CACHE'});
    }
    if(action==='referees'){
      const comp=Number(req.query.competition)||0,hours=Math.max(24,Math.min(336,Number(req.query.hours)||336));
      const from=new Date(Date.now()-7*86400000).toISOString(),to=new Date(Date.now()+hours*3600000).toISOString();
      const filters=[`kickoff_utc=gte.${encodeURIComponent(from)}`,`kickoff_utc=lte.${encodeURIComponent(to)}`];if(comp>0)filters.push(`sofascore_competition_id=eq.${comp}`);
      const data=await rest(`football_referee_assignments_cache?select=*&${filters.join('&')}&order=kickoff_utc.asc`);
      return res.status(200).json({ok:true,referees:data||[],competition:comp||null,source:'CENTRAL_CACHE'});
    }
    if(action==='playerprops'){
      const hours=Math.max(24,Math.min(336,Number(req.query.hours)||336));
      const from=new Date(Date.now()-6*3600000).toISOString(),to=new Date(Date.now()+hours*3600000).toISOString();
      const data=await rest(`football_player_props_cache?select=*&kickoff_utc=gte.${encodeURIComponent(from)}&kickoff_utc=lte.${encodeURIComponent(to)}&order=kickoff_utc.asc`);
      return res.status(200).json({ok:true,playerprops:data||[],hours,source:'CENTRAL_CACHE'});
    }
    if(action==='lineups'){
      const fixture=Number(req.query.fixture)||0;
      const q=fixture?`football_lineups_cache?select=*&fixture_id=eq.${fixture}&order=updated_at.desc`:'football_lineups_cache?select=*&order=updated_at.desc&limit=50';
      const data=await rest(q).catch(()=>[]);
      return res.status(200).json({ok:true,lineups:data||[],source:'CENTRAL_CACHE'});
    }
    return res.status(400).json({ok:false,code:'ACTION_INVALID'});
  }catch(e){return res.status(200).json({ok:false,teams:[],fixtures:[],odds:[],markets:[],playerprops:[],referees:[],lineups:[],message:e.message});}
};
