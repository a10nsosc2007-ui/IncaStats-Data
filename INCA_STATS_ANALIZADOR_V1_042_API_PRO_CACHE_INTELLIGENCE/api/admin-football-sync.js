'use strict';

const {requireUser}=require('./_auth');
const FOOT=require('./_football-provider');
const BRIDGE=require('./_fixture-bridge');
const CRON=require('./cron-sync');
const CORE=CRON._internals;

async function admin(user){
  if(!FOOT.SERVICE)return false;
  const r=await fetch(`${FOOT.SUPA}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=app_role`,{headers:{apikey:FOOT.SERVICE,Authorization:`Bearer ${FOOT.SERVICE}`}});
  if(!r.ok)return false;const d=await r.json();return String(d?.[0]?.app_role||'').toLowerCase()==='admin';
}
async function refereeHistory(comps,ctx){
  const out=[];let leagues=0;
  for(const c of comps){
    if(!CORE.canSpend(ctx,2))break;
    const j=await FOOT.call(ctx,'/fixtures',{league:Number(c.api_league_id),season:Number(c.season)});leagues++;
    for(const x of j.response||[]){if(!x.fixture?.referee)continue;out.push({fixture_id:Number(x.fixture.id),api_league_id:Number(c.api_league_id),sofascore_competition_id:Number(c.sofascore_competition_id),league_name:x.league?.name||c.league_name,season:Number(x.league?.season)||Number(c.season),kickoff_utc:new Date(x.fixture.date).toISOString(),referee:String(x.fixture.referee||''),home_team_name:x.teams?.home?.name||'',away_team_name:x.teams?.away?.name||'',status_short:x.fixture?.status?.short||null,updated_at:new Date().toISOString()});}
  }
  if(out.length)await FOOT.supa('football_referee_assignments_cache?on_conflict=fixture_id',{method:'POST',body:JSON.stringify(out)});
  return{saved:out.length,leagues_queried:leagues,leagues_total:comps.length};
}

module.exports=async function handler(req,res){
  const user=await requireUser(req,res);if(!user)return;
  if(!(await admin(user)))return res.status(403).json({ok:false,code:'ADMIN_ONLY'});
  if(req.method!=='POST')return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});
  const mode=String(req.query.mode||req.body?.mode||'all').toLowerCase();
  let ctx=null;
  try{
    ctx=await FOOT.createBudget(`admin-${mode}`);const start=ctx.used;
    const comps=await CORE.getCompetitions(ctx);let teams={rows:await FOOT.rows('football_current_teams?select=*&is_current=eq.true').catch(()=>[]),added:0,refreshed_leagues:0,pending_leagues:0};
    let fixtures={rows:[],bridge_count:0},odds=null,lineups=null,referees=null;
    if(['all','teams'].includes(mode)){const maxLeagues=Math.max(1,Math.min(31,Number(req.body?.maxLeagues)|| (mode==='teams'?12:6)));teams=await CORE.syncTeamsIfNeeded(comps,ctx,maxLeagues);}
    if(['all','fixtures','odds','lineups'].includes(mode)){
      if(!teams.rows.length)teams.rows=await FOOT.rows('football_current_teams?select=*&is_current=eq.true').catch(()=>[]);
      fixtures=await CORE.syncFixtures(comps,teams.rows,ctx);
    }
    if(['all','odds'].includes(mode))odds=await CORE.syncOdds(comps,fixtures.rows,ctx);
    if(['all','lineups'].includes(mode))lineups=await CORE.syncLineups(fixtures.rows,ctx);
    if(mode==='referees')referees=await refereeHistory(comps,ctx);
    if(!['all','teams','fixtures','odds','lineups','referees'].includes(mode))return res.status(400).json({ok:false,code:'MODE_INVALID'});
    let meta={version:'1.043',mode,competitions:comps.length,teams:{current:teams.rows.length,added:teams.added,refreshed_leagues:teams.refreshed_leagues,pending_leagues:teams.pending_leagues},fixtures:fixtures.rows.length,fixture_bridges:fixtures.bridge_count,odds,lineups,referees,bridge:BRIDGE.stats(),requests_this_run:ctx.used-start,daily_budget:ctx.maxDaily,run_budget:ctx.maxRun};
    meta=await FOOT.finishBudget(ctx,meta);
    await FOOT.supa('football_sync_state?on_conflict=job_name',{method:'POST',body:JSON.stringify([{job_name:`inca_v1043_admin_${mode}`,last_success_at:new Date().toISOString(),status:'ok',meta}])});
    return res.status(200).json({ok:true,...meta,requests_today:ctx.used});
  }catch(e){
    const message=String(e.message||e);if(ctx)await FOOT.finishBudget(ctx,{version:'1.043',mode,error:message}).catch(()=>{});
    return res.status(500).json({ok:false,message});
  }
};
