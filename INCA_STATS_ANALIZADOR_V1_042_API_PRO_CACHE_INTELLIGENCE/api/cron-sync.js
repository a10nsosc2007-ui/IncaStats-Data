'use strict';

const FOOT=require('./_football-provider');
const BRIDGE=require('./_fixture-bridge');
const {supa:sr,rows}=FOOT;

const NO_PRICE=new Set([325,390,155,406,242]);
const CURATED=[
[17,'INGLATERRA','Premier League'],[18,'INGLATERRA','Championship'],[24,'INGLATERRA','League One'],[25,'INGLATERRA','League Two'],[8,'ESPAÑA','LaLiga EA Sports'],[54,'ESPAÑA','LaLiga Hypermotion'],[23,'ITALIA','Serie A'],[53,'ITALIA','Serie B'],[35,'ALEMANIA','Bundesliga'],[44,'ALEMANIA','2. Bundesliga'],[34,'FRANCIA','Ligue 1'],[182,'FRANCIA','Ligue 2'],[238,'PORTUGAL','Liga Portugal'],[239,'PORTUGAL','Liga Portugal 2'],[37,'PAÍSES BAJOS','Eredivisie'],[131,'PAÍSES BAJOS','Eerste Divisie'],[38,'BÉLGICA','Belgian Pro League'],[52,'TURQUÍA','Süper Lig'],[98,'TURQUÍA','1. Lig'],[45,'AUSTRIA','Austrian Bundesliga'],[215,'SUIZA','Swiss Super League'],[39,'DINAMARCA','Danish Superliga'],[40,'SUECIA','Allsvenskan'],[20,'NORUEGA','Eliteserien'],[152,'RUMANÍA','Liga I'],[185,'GRECIA','Super League Greece'],[325,'BRASIL','Brasileirão Série A'],[390,'BRASIL','Brasileirão Série B'],[155,'ARGENTINA','Liga Profesional Argentina'],[406,'PERÚ','Liga 1 Perú'],[242,'EE. UU. / CANADÁ','MLS']];
const COUNTRY={'INGLATERRA':'England','ESPAÑA':'Spain','ITALIA':'Italy','ALEMANIA':'Germany','FRANCIA':'France','PORTUGAL':'Portugal','PAÍSES BAJOS':'Netherlands','BÉLGICA':'Belgium','TURQUÍA':'Turkey','AUSTRIA':'Austria','SUIZA':'Switzerland','DINAMARCA':'Denmark','SUECIA':'Sweden','NORUEGA':'Norway','RUMANÍA':'Romania','GRECIA':'Greece','BRASIL':'Brazil','ARGENTINA':'Argentina','PERÚ':'Peru','EE. UU. / CANADÁ':'USA'};
const ALIAS={'LaLiga EA Sports':'La Liga','LaLiga Hypermotion':'Segunda Division','Liga Portugal':'Primeira Liga','Belgian Pro League':'Jupiler Pro League','Danish Superliga':'Superliga','Liga 1 Perú':'Primera División','MLS':'Major League Soccer','Brasileirão Série A':'Serie A','Brasileirão Série B':'Serie B'};

function norm(v=''){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function sim(a,b){a=norm(a);b=norm(b);if(!a||!b)return 0;if(a===b)return 1;if(a.includes(b)||b.includes(a))return .92;const A=new Set(a.split(' ')),B=new Set(b.split(' '));const hit=[...A].filter(x=>B.has(x)).length;return hit/Math.max(A.size,B.size,1);}
function leagueScore(target,item){const [,country,name]=target,want=ALIAS[name]||name;let score=sim(want,item.league?.name)*100,wc=norm(COUNTRY[country]||country),ic=norm(item.country?.name);if(wc===ic)score+=35;else if(wc&&ic&&(wc.includes(ic)||ic.includes(wc)))score+=15;return score;}
function seasonOf(x){const s=(x.seasons||[]).find(s=>s.current)||(x.seasons||[]).slice().sort((a,b)=>Number(b.year)-Number(a.year))[0];return Number(s?.year)||new Date().getUTCFullYear();}
function limaDate(d){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d),o=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${o.year}-${o.month}-${o.day}`;}
function addDays(key,n){const d=new Date(`${key}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function rowKey(parts){return parts.map(x=>String(x??'').trim()).join('|').slice(0,900);}
function canSpend(ctx,reserve=0){return ctx.used<ctx.maxDaily-reserve&&ctx.used-ctx.start<ctx.maxRun-reserve;}

async function getCompetitions(ctx){
  let comps=await rows('football_competitions_cache?select=*&is_current=eq.true&order=sofascore_competition_id.asc').catch(()=>[]);
  // Refresca el catálogo como máximo ~1 vez al día para detectar cambios de temporada sin gastar por click.
  const updateTimes=comps.map(x=>new Date(x.updated_at||0).getTime()).filter(x=>Number.isFinite(x)&&x>0),oldestUpdate=updateTimes.length?Math.min(...updateTimes):0;
  if(comps.length>=25&&oldestUpdate&&Date.now()-oldestUpdate<20*3600000)return comps;
  const j=await FOOT.call(ctx,'/leagues',{current:'true'}),all=j.response||[];
  comps=CURATED.map(t=>{let best=null,score=-1;for(const x of all){const s=leagueScore(t,x);if(s>score){best=x;score=s;}}return best&&score>=65?{sofascore_competition_id:t[0],api_league_id:Number(best.league.id),league_name:best.league.name,display_name:t[2],country:best.country?.name||COUNTRY[t[1]]||t[1],season:seasonOf(best),league_logo:best.league.logo||null,is_current:true,updated_at:new Date().toISOString()}:null;}).filter(Boolean);
  if(comps.length)await sr('football_competitions_cache?on_conflict=sofascore_competition_id',{method:'POST',body:JSON.stringify(comps)});
  return comps;
}

async function syncTeamsIfNeeded(comps,ctx,maxLeagues=Math.max(1,Math.min(31,Number(process.env.INCA_TEAM_REFRESH_PER_RUN)||6))){
  const existing=await rows('football_current_teams?select=*&is_current=eq.true').catch(()=>[]);
  const states=new Map();
  for(const x of existing){
    const k=`${Number(x.api_league_id)}|${Number(x.season)}`,prev=states.get(k)||{count:0,newest:0};
    prev.count++;prev.newest=Math.max(prev.newest,new Date(x.updated_at||0).getTime()||0);states.set(k,prev);
  }
  // Además de rellenar ligas vacías, renueva plantillas actuales por tandas cada 7 días.
  const maxAge=7*86400000;
  const allTargets=comps.filter(c=>{const st=states.get(`${Number(c.api_league_id)}|${Number(c.season)}`)||{count:0,newest:0};return st.count<8||!st.newest||Date.now()-st.newest>maxAge;}),targets=allTargets.slice(0,maxLeagues);
  let added=0,leagues=0;
  for(const c of targets){
    if(!canSpend(ctx,5))break;
    const j=await FOOT.call(ctx,'/teams',{league:c.api_league_id,season:c.season}),apiTeams=j.response||[];
    const mapped=apiTeams.map(x=>{const t=x.team||{},m=BRIDGE.mapSofaTeam(t.name,c.sofascore_competition_id,t.country||c.country);return{api_team_id:Number(t.id),sofascore_team_id:m?.team_id||null,team_name:t.name||'',team_code:t.code||null,team_logo:t.logo||null,country:t.country||c.country||'',api_league_id:Number(c.api_league_id),sofascore_competition_id:Number(c.sofascore_competition_id),league_name:c.league_name,season:Number(c.season),is_current:true,updated_at:new Date().toISOString()};}).filter(x=>x.api_team_id&&x.team_name);
    if(mapped.length){await sr(`football_current_teams?api_league_id=eq.${Number(c.api_league_id)}&season=eq.${Number(c.season)}&is_current=eq.true`,{method:'PATCH',body:JSON.stringify({is_current:false,updated_at:new Date().toISOString()})}).catch(()=>{});await sr('football_current_teams?on_conflict=api_team_id,api_league_id,season',{method:'POST',body:JSON.stringify(mapped)});added+=mapped.length;leagues++;}
  }
  const all=await rows('football_current_teams?select=*&is_current=eq.true').catch(()=>existing);
  return {rows:all,added,refreshed_leagues:leagues,pending_leagues:Math.max(0,allTargets.length-leagues)};
}

async function syncFixtures(comps,teamRows,ctx){
  const allow=new Map(comps.map(x=>[Number(x.api_league_id),x])),teamMap=new Map();
  for(const t of teamRows||[])teamMap.set(Number(t.api_team_id),Number(t.sofascore_team_id)||null);
  const today=limaDate(new Date()),dates=[today,addDays(today,1)],out=[],bridges=[];
  for(const date of dates){
    const j=await FOOT.call(ctx,'/fixtures',{date,timezone:'America/Lima'});
    for(const x of j.response||[]){
      const lid=Number(x.league?.id),c=allow.get(lid);if(!c)continue;
      const homeApi=Number(x.teams?.home?.id),awayApi=Number(x.teams?.away?.id);
      const hm=teamMap.get(homeApi)||BRIDGE.mapSofaTeam(x.teams?.home?.name,c.sofascore_competition_id,x.teams?.home?.country||c.country)?.team_id||null;
      const am=teamMap.get(awayApi)||BRIDGE.mapSofaTeam(x.teams?.away?.name,c.sofascore_competition_id,x.teams?.away?.country||c.country)?.team_id||null;
      const row={fixture_id:Number(x.fixture?.id),sofascore_event_id:null,api_league_id:lid,sofascore_competition_id:Number(c.sofascore_competition_id),league_name:x.league?.name||c.league_name,season:Number(x.league?.season)||Number(c.season),kickoff_utc:new Date(x.fixture?.date).toISOString(),status_short:x.fixture?.status?.short||null,round:x.league?.round||null,referee:x.fixture?.referee||null,venue_name:x.fixture?.venue?.name||null,venue_city:x.fixture?.venue?.city||null,home_api_team_id:homeApi,home_sofascore_team_id:hm,home_team_name:x.teams?.home?.name||'',home_logo:x.teams?.home?.logo||null,away_api_team_id:awayApi,away_sofascore_team_id:am,away_team_name:x.teams?.away?.name||'',away_logo:x.teams?.away?.logo||null,updated_at:new Date().toISOString()};
      const bridge=BRIDGE.bridgeRow(row);if(bridge){row.sofascore_event_id=bridge.sofascore_event_id;row.home_sofascore_team_id=bridge.home_sofascore_team_id||row.home_sofascore_team_id;row.away_sofascore_team_id=bridge.away_sofascore_team_id||row.away_sofascore_team_id;bridges.push(bridge);}out.push(row);
    }
  }
  if(out.length)await sr('football_fixtures_cache?on_conflict=fixture_id',{method:'POST',body:JSON.stringify(out)});
  if(bridges.length)await sr('football_fixture_bridge?on_conflict=fixture_id',{method:'POST',body:JSON.stringify(bridges)});
  const refs=out.filter(x=>x.referee).map(x=>({fixture_id:x.fixture_id,api_league_id:x.api_league_id,sofascore_competition_id:x.sofascore_competition_id,league_name:x.league_name,season:x.season,kickoff_utc:x.kickoff_utc,referee:x.referee,home_team_name:x.home_team_name,away_team_name:x.away_team_name,status_short:x.status_short,updated_at:new Date().toISOString()}));
  if(refs.length)await sr('football_referee_assignments_cache?on_conflict=fixture_id',{method:'POST',body:JSON.stringify(refs)});
  return {rows:out,bridge_count:bridges.length};
}

function flattenOdds(fixture,item){
  const oddsRows=[],propRows=[],marketRows=[];
  for(const b of item?.bookmakers||[])for(const bet of b.bets||[]){
    const marketName=String(bet.name||''),marketKey=norm(marketName).replace(/\s+/g,'_'),isPlayer=/player|goalscorer|shot|assist|card/i.test(marketName),source='API-FOOTBALL';
    marketRows.push({fixture_id:fixture.fixture_id,odds_event_id:String(item.fixture?.id||fixture.fixture_id),sport_key:'api-football',source,bookmaker:b.name||'',market_key:marketKey,discovered_at:new Date().toISOString()});
    for(const v of bet.values||[]){
      const price=Number(v.odd);if(!(price>1))continue;
      const raw=String(v.value||''),m=raw.match(/^(over|under)\s*([0-9]+(?:\.[0-9]+)?)/i),direction=m?m[1].toLowerCase():null,point=m?Number(m[2]):null;
      const key=rowKey([source,fixture.fixture_id,b.id,bet.id,raw,point]);
      oddsRows.push({row_key:key,fixture_id:fixture.fixture_id,kickoff_utc:fixture.kickoff_utc,market_key:marketKey,market_name:marketName,bookmaker:b.name||'',direction,outcome_name:raw,selection_raw:raw,point,price,source,fetched_at:new Date().toISOString()});
      if(isPlayer){let player='';if(!/^(over|under|yes|no|home|away|draw)\b/i.test(raw))player=raw.replace(/\s*-\s*(yes|no|over|under).*$/i,'').trim();if(player&&player.length>=4)propRows.push({row_key:key,fixture_id:fixture.fixture_id,kickoff_utc:fixture.kickoff_utc,market_key:marketKey,market_name:marketName,bookmaker:b.name||'',player_name:player,direction,outcome_name:raw,selection_raw:raw,point,price,source,fetched_at:new Date().toISOString()});}
    }
  }
  return {oddsRows,propRows,marketRows};
}

async function syncOdds(comps,fixtures,ctx){
  const compByApi=new Map(comps.map(c=>[Number(c.api_league_id),c])),groups=new Map();
  for(const f of fixtures){const c=compByApi.get(Number(f.api_league_id));if(!c||NO_PRICE.has(Number(c.sofascore_competition_id)))continue;const date=limaDate(new Date(f.kickoff_utc)),key=`${f.api_league_id}|${f.season}|${date}`;if(!groups.has(key))groups.set(key,{league:f.api_league_id,season:f.season,date,fixtures:[]});groups.get(key).fixtures.push(f);}
  let oddsRows=[],propRows=[],marketRows=[],queriedGroups=0;
  const ordered=[...groups.values()].sort((a,b)=>new Date(a.fixtures[0]?.kickoff_utc||0)-new Date(b.fixtures[0]?.kickoff_utc||0));
  for(const g of ordered){
    if(!canSpend(ctx,2))break;let page=1,total=1;queriedGroups++;
    do{
      const j=await FOOT.call(ctx,'/odds',{league:g.league,season:g.season,date:g.date,page});total=Math.min(Number(j.paging?.total||1),3);
      for(const item of j.response||[]){const fixture=g.fixtures.find(f=>Number(f.fixture_id)===Number(item.fixture?.id));if(!fixture)continue;const flat=flattenOdds(fixture,item);oddsRows.push(...flat.oddsRows);propRows.push(...flat.propRows);marketRows.push(...flat.marketRows);}page++;
    }while(page<=total&&canSpend(ctx,2));
  }
  if(oddsRows.length)await sr('football_odds_cache?on_conflict=row_key',{method:'POST',body:JSON.stringify(oddsRows)});
  if(propRows.length)await sr('football_player_props_cache?on_conflict=row_key',{method:'POST',body:JSON.stringify(propRows)});
  if(marketRows.length)await sr('football_market_availability_cache?on_conflict=fixture_id,source,bookmaker,market_key',{method:'POST',body:JSON.stringify(marketRows)});
  return {odds:oddsRows.length,props:propRows.length,markets:marketRows.length,groups_total:groups.size,groups_queried:queriedGroups};
}

async function syncLineups(fixtures,ctx){
  const now=Date.now(),near=fixtures.filter(f=>{const d=new Date(f.kickoff_utc).getTime()-now;return d>=-30*60000&&d<=180*60000;}).slice(0,12),out=[];
  for(const f of near){if(!canSpend(ctx,1))break;const j=await FOOT.call(ctx,'/fixtures/lineups',{fixture:f.fixture_id});if((j.response||[]).length)out.push({fixture_id:f.fixture_id,payload:j.response,updated_at:new Date().toISOString()});}
  if(out.length)await sr('football_lineups_cache?on_conflict=fixture_id',{method:'POST',body:JSON.stringify(out)});return{candidates:near.length,saved:out.length};
}
function cronAllowed(req){const secret=process.env.CRON_SECRET;if(!secret)return false;return String(req.headers.authorization||'')===`Bearer ${secret}`;}

module.exports=async function handler(req,res){
  if(!process.env.CRON_SECRET)return res.status(500).json({ok:false,code:'CRON_SECRET_MISSING'});
  if(!cronAllowed(req))return res.status(401).json({ok:false,code:'CRON_AUTH'});
  if(!FOOT.SERVICE||!FOOT.keyEntries().length)return res.status(500).json({ok:false,code:'ENV_MISSING',need:['API_FOOTBALL_KEY','SUPABASE_SERVICE_ROLE_KEY']});
  let ctx=null,meta={version:'1.043',mode:'CACHE_ONLY',bridge:BRIDGE.stats()};
  try{
    ctx=await FOOT.createBudget('cron-sync');const start=ctx.used;
    const comps=await getCompetitions(ctx);
    const teams=await syncTeamsIfNeeded(comps,ctx);
    const fixtureResult=await syncFixtures(comps,teams.rows,ctx);
    const odds=await syncOdds(comps,fixtureResult.rows,ctx);
    const lineups=await syncLineups(fixtureResult.rows,ctx);
    Object.assign(meta,{competitions:comps.length,teams:{current:teams.rows.length,added:teams.added,refreshed_leagues:teams.refreshed_leagues,pending_leagues:teams.pending_leagues},fixtures:fixtureResult.rows.length,fixture_bridges:fixtureResult.bridge_count,odds,lineups,requests_this_run:ctx.used-start,daily_budget:ctx.maxDaily,run_budget:ctx.maxRun});
    meta=await FOOT.finishBudget(ctx,meta);
    await sr('football_sync_state?on_conflict=job_name',{method:'POST',body:JSON.stringify([{job_name:'inca_v1043_pro_sync',last_success_at:new Date().toISOString(),status:'ok',meta}])});
    return res.status(200).json({ok:true,...meta,requests_today:ctx.used});
  }catch(e){
    meta.error=String(e.message||e);if(ctx){meta.requests_this_run=ctx.used-ctx.start;meta.daily_budget=ctx.maxDaily;meta.run_budget=ctx.maxRun;meta=await FOOT.finishBudget(ctx,meta).catch(()=>meta);}
    await sr('football_sync_state?on_conflict=job_name',{method:'POST',body:JSON.stringify([{job_name:'inca_v1043_pro_sync',last_success_at:new Date().toISOString(),status:'partial',meta}])}).catch(()=>{});
    return res.status(200).json({ok:false,message:meta.error,requests_today:ctx?.used||0,daily_budget:ctx?.maxDaily||0,run_budget:ctx?.maxRun||0,meta});
  }
};

module.exports._internals={getCompetitions,syncTeamsIfNeeded,syncFixtures,syncOdds,syncLineups,canSpend};
