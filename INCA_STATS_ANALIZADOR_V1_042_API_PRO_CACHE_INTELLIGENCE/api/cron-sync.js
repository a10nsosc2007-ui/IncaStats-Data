
const API='https://v3.football.api-sports.io';
const SUPA=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'https://jijxmshpzcoalohlhhnb.supabase.co';
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY||'';

let keyIndex = 0;
function getKey(){
  const keys=[
    process.env.API_FOOTBALL_KEY_1,
    process.env.API_FOOTBALL_KEY_2,
    process.env.API_FOOTBALL_KEY_3,
    process.env.API_FOOTBALL_KEY_4,
    process.env.API_FOOTBALL_KEY_5,
    process.env.API_FOOTBALL_KEY_6,
    process.env.API_FOOTBALL_KEY_7,
    process.env.API_FOOTBALL_KEY_8,
    process.env.API_FOOTBALL_KEY_9,
    process.env.API_FOOTBALL_KEY
  ].filter(Boolean);
  if(!keys.length) return '';
  return keys[keyIndex++ % keys.length];
}
function KEY(){ return Boolean(getKey()); }

const MAX_DAILY=Math.max(6,Math.min(135,Number(process.env.INCA_API_DAILY_BUDGET)||15));
const MAX_RUN=Math.max(4,Math.min(MAX_DAILY,Number(process.env.INCA_API_RUN_BUDGET)||Math.ceil(MAX_DAILY/2)));
const NO_PRICE=new Set([325,390,155,406,242]);
const CURATED=[
[17,'INGLATERRA','Premier League'],[18,'INGLATERRA','Championship'],[24,'INGLATERRA','League One'],[25,'INGLATERRA','League Two'],[8,'ESPAÑA','LaLiga EA Sports'],[54,'ESPAÑA','LaLiga Hypermotion'],[23,'ITALIA','Serie A'],[53,'ITALIA','Serie B'],[35,'ALEMANIA','Bundesliga'],[44,'ALEMANIA','2. Bundesliga'],[34,'FRANCIA','Ligue 1'],[182,'FRANCIA','Ligue 2'],[238,'PORTUGAL','Liga Portugal'],[239,'PORTUGAL','Liga Portugal 2'],[37,'PAÍSES BAJOS','Eredivisie'],[131,'PAÍSES BAJOS','Eerste Divisie'],[38,'BÉLGICA','Belgian Pro League'],[52,'TURQUÍA','Süper Lig'],[98,'TURQUÍA','1. Lig'],[45,'AUSTRIA','Austrian Bundesliga'],[215,'SUIZA','Swiss Super League'],[39,'DINAMARCA','Danish Superliga'],[40,'SUECIA','Allsvenskan'],[20,'NORUEGA','Eliteserien'],[152,'RUMANÍA','Liga I'],[185,'GRECIA','Super League Greece'],[325,'BRASIL','Brasileirão Série A'],[390,'BRASIL','Brasileirão Série B'],[155,'ARGENTINA','Liga Profesional Argentina'],[406,'PERÚ','Liga 1 Perú'],[242,'EE. UU. / CANADÁ','MLS']];
const COUNTRY={'INGLATERRA':'England','ESPAÑA':'Spain','ITALIA':'Italy','ALEMANIA':'Germany','FRANCIA':'France','PORTUGAL':'Portugal','PAÍSES BAJOS':'Netherlands','BÉLGICA':'Belgium','TURQUÍA':'Turkey','AUSTRIA':'Austria','SUIZA':'Switzerland','DINAMARCA':'Denmark','SUECIA':'Sweden','NORUEGA':'Norway','RUMANÍA':'Romania','GRECIA':'Greece','BRASIL':'Brazil','ARGENTINA':'Argentina','PERÚ':'Peru','EE. UU. / CANADÁ':'USA'};
const ALIAS={'LaLiga EA Sports':'La Liga','LaLiga Hypermotion':'Segunda Division','Liga Portugal':'Primeira Liga','Belgian Pro League':'Jupiler Pro League','Danish Superliga':'Superliga','Liga 1 Perú':'Primera División','MLS':'Major League Soccer','Brasileirão Série A':'Serie A','Brasileirão Série B':'Serie B'};
function norm(v=''){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function sim(a,b){a=norm(a);b=norm(b);if(!a||!b)return 0;if(a===b)return 1;if(a.includes(b)||b.includes(a))return .92;const A=new Set(a.split(' ')),B=new Set(b.split(' '));const hit=[...A].filter(x=>B.has(x)).length;return hit/Math.max(A.size,B.size,1)}
function leagueScore(target,item){const [,country,name]=target,want=ALIAS[name]||name;let score=sim(want,item.league?.name)*100,wc=norm(COUNTRY[country]||country),ic=norm(item.country?.name);if(wc===ic)score+=35;else if(wc&&ic&&(wc.includes(ic)||ic.includes(wc)))score+=15;return score}
function seasonOf(x){const s=(x.seasons||[]).find(s=>s.current)||(x.seasons||[]).slice().sort((a,b)=>Number(b.year)-Number(a.year))[0];return Number(s?.year)||new Date().getUTCFullYear()}
function limaDate(d){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d),o=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${o.year}-${o.month}-${o.day}`}
function addDays(key,n){const d=new Date(`${key}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function rowKey(parts){return parts.map(x=>String(x??'').trim()).join('|').slice(0,900)}
async function sr(path,opt={}){if(!SERVICE)throw new Error('SUPABASE_SERVICE_ROLE_KEY_MISSING');const r=await fetch(`${SUPA}/rest/v1/${path}`,{...opt,headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal',...(opt.headers||{})}});if(!r.ok)throw new Error(`SUPABASE_${r.status}_${await r.text()}`);return r}
async function rows(path){const r=await sr(path,{headers:{Prefer:'return=representation'}});return r.json()}
async function currentUsed(){const day=new Date().toISOString().slice(0,10);const x=await rows(`football_api_usage_daily?select=*&day=eq.${day}&limit=1`).catch(()=>[]);return Number(x?.[0]?.used||0)}
async function saveUsed(used,meta={}){const day=new Date().toISOString().slice(0,10);await sr('football_api_usage_daily?on_conflict=day',{method:'POST',body:JSON.stringify([{day,used,last_run_at:new Date().toISOString(),meta}])})}
async function call(path,params,budget){
  if(budget.used>=MAX_DAILY)throw new Error('DAILY_BUDGET_REACHED');
  if(budget.used-budget.start>=MAX_RUN)throw new Error('RUN_BUDGET_REACHED');
  const k=getKey();if(!k)throw new Error('API_FOOTBALL_KEY_MISSING');
  const u=new URL(API+path);Object.entries(params||{}).forEach(([a,b])=>b!==undefined&&b!==null&&b!==''&&u.searchParams.set(a,String(b)));
  const r=await fetch(u,{headers:{'x-apisports-key':k},cache:'no-store'});budget.used++;
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j?.errors&&(Array.isArray(j.errors)?j.errors.length:Object.keys(j.errors).length))throw new Error(`API_${r.status}_${JSON.stringify(j.errors||{})}`);
  return j;
}
async function getCompetitions(budget){
  let comps=await rows('football_competitions_cache?select=*&is_current=eq.true&order=sofascore_competition_id.asc').catch(()=>[]);
  if(comps.length>=25)return comps;
  const j=await call('/leagues',{current:'true'},budget),all=j.response||[];
  comps=CURATED.map(t=>{let best=null,score=-1;for(const x of all){const s=leagueScore(t,x);if(s>score){best=x;score=s}}return best&&score>=65?{sofascore_competition_id:t[0],api_league_id:Number(best.league.id),league_name:best.league.name,display_name:t[2],country:best.country?.name||COUNTRY[t[1]]||t[1],season:seasonOf(best),league_logo:best.league.logo||null,is_current:true,updated_at:new Date().toISOString()}:null}).filter(Boolean);
  if(comps.length)await sr('football_competitions_cache?on_conflict=sofascore_competition_id',{method:'POST',body:JSON.stringify(comps)});
  return comps;
}
async function syncFixtures(comps,budget){
  const allow=new Map(comps.map(x=>[Number(x.api_league_id),x])),today=limaDate(new Date()),dates=[today,addDays(today,1)],out=[];
  for(const date of dates){
    const j=await call('/fixtures',{date,timezone:'America/Lima'},budget);
    for(const x of j.response||[]){
      const lid=Number(x.league?.id),c=allow.get(lid);if(!c)continue;
      out.push({fixture_id:Number(x.fixture?.id),api_league_id:lid,sofascore_competition_id:Number(c.sofascore_competition_id),league_name:x.league?.name||c.league_name,season:Number(x.league?.season)||Number(c.season),kickoff_utc:new Date(x.fixture?.date).toISOString(),status_short:x.fixture?.status?.short||null,round:x.league?.round||null,referee:x.fixture?.referee||null,venue_name:x.fixture?.venue?.name||null,venue_city:x.fixture?.venue?.city||null,home_api_team_id:Number(x.teams?.home?.id),home_sofascore_team_id:null,home_team_name:x.teams?.home?.name||'',home_logo:x.teams?.home?.logo||null,away_api_team_id:Number(x.teams?.away?.id),away_sofascore_team_id:null,away_team_name:x.teams?.away?.name||'',away_logo:x.teams?.away?.logo||null,updated_at:new Date().toISOString()});
    }
  }
  if(out.length)await sr('football_fixtures_cache?on_conflict=fixture_id',{method:'POST',body:JSON.stringify(out)});
  const refs=out.filter(x=>x.referee).map(x=>({fixture_id:x.fixture_id,api_league_id:x.api_league_id,sofascore_competition_id:x.sofascore_competition_id,league_name:x.league_name,season:x.season,kickoff_utc:x.kickoff_utc,referee:x.referee,home_team_name:x.home_team_name,away_team_name:x.away_team_name,status_short:x.status_short,updated_at:new Date().toISOString()}));
  if(refs.length)await sr('football_referee_assignments_cache?on_conflict=fixture_id',{method:'POST',body:JSON.stringify(refs)});
  return out;
}
function flattenOdds(fixture,item){
  const rows=[],props=[],markets=[];
  for(const b of item?.bookmakers||[])for(const bet of b.bets||[]){
    const marketName=String(bet.name||''),marketKey=norm(marketName).replace(/\s+/g,'_'),isPlayer=/player|goalscorer|shot|assist|card/i.test(marketName);
    markets.push({fixture_id:fixture.fixture_id,odds_event_id:String(item.fixture?.id||fixture.fixture_id),sport_key:'api-football',bookmaker:b.name||'',market_key:marketKey,discovered_at:new Date().toISOString()});
    for(const v of bet.values||[]){
      const price=Number(v.odd);if(!(price>1))continue;
      const raw=String(v.value||''),m=raw.match(/^(over|under)\s*([0-9]+(?:\.[0-9]+)?)/i),direction=m?m[1].toLowerCase():null,point=m?Number(m[2]):null;
      const key=rowKey([fixture.fixture_id,b.id,bet.id,raw,point]);
      rows.push({row_key:key,fixture_id:fixture.fixture_id,kickoff_utc:fixture.kickoff_utc,market_key:marketKey,market_name:marketName,bookmaker:b.name||'',direction,outcome_name:raw,selection_raw:raw,point,price,source:'API-FOOTBALL',fetched_at:new Date().toISOString()});
      if(isPlayer){
        let player='';
        if(!/^(over|under|yes|no|home|away|draw)\b/i.test(raw))player=raw.replace(/\s*-\s*(yes|no|over|under).*$/i,'').trim();
        if(player&&player.length>=4)props.push({row_key:key,fixture_id:fixture.fixture_id,kickoff_utc:fixture.kickoff_utc,market_key:marketKey,market_name:marketName,bookmaker:b.name||'',player_name:player,direction,outcome_name:raw,selection_raw:raw,point,price,source:'API-FOOTBALL',fetched_at:new Date().toISOString()});
      }
    }
  }
  return {rows,props,markets};
}
async function syncOdds(comps,fixtures,budget){
  const compByApi=new Map(comps.map(c=>[Number(c.api_league_id),c])),groups=new Map();
  for(const f of fixtures){
    const c=compByApi.get(Number(f.api_league_id));if(!c||NO_PRICE.has(Number(c.sofascore_competition_id)))continue;
    const date=limaDate(new Date(f.kickoff_utc)),key=`${f.api_league_id}|${f.season}|${date}`;if(!groups.has(key))groups.set(key,{league:f.api_league_id,season:f.season,date,fixtures:[]});groups.get(key).fixtures.push(f);
  }
  let oddsRows=[],propRows=[],marketRows=[];
  const ordered=[...groups.values()].sort((a,b)=>new Date(a.fixtures[0]?.kickoff_utc||0)-new Date(b.fixtures[0]?.kickoff_utc||0));
  for(const g of ordered){
    if(budget.used>=MAX_DAILY-2||budget.used-budget.start>=MAX_RUN-2)break;
    let page=1,total=1;
    do{
      const j=await call('/odds',{league:g.league,season:g.season,date:g.date,page},budget);total=Math.min(Number(j.paging?.total||1),3);
      for(const item of j.response||[]){
        const fixture=g.fixtures.find(f=>Number(f.fixture_id)===Number(item.fixture?.id));if(!fixture)continue;
        const flat=flattenOdds(fixture,item);oddsRows.push(...flat.rows);propRows.push(...flat.props);marketRows.push(...flat.markets);
      }
      page++;
    }while(page<=total&&budget.used<MAX_DAILY-2&&budget.used-budget.start<MAX_RUN-2);
  }
  if(oddsRows.length)await sr('football_odds_cache?on_conflict=row_key',{method:'POST',body:JSON.stringify(oddsRows)});
  if(propRows.length)await sr('football_player_props_cache?on_conflict=row_key',{method:'POST',body:JSON.stringify(propRows)});
  if(marketRows.length)await sr('football_market_availability_cache?on_conflict=fixture_id,bookmaker,market_key',{method:'POST',body:JSON.stringify(marketRows)});
  return {odds:oddsRows.length,props:propRows.length,markets:marketRows.length,groups:groups.size};
}
async function syncLineups(fixtures,budget){
  const now=Date.now(),near=fixtures.filter(f=>{const d=new Date(f.kickoff_utc).getTime()-now;return d>=-30*60000&&d<=180*60000}).slice(0,12),out=[];
  for(const f of near){if(budget.used>=MAX_DAILY-1||budget.used-budget.start>=MAX_RUN-1)break;const j=await call('/fixtures/lineups',{fixture:f.fixture_id},budget);if((j.response||[]).length)out.push({fixture_id:f.fixture_id,payload:j.response,updated_at:new Date().toISOString()});}
  if(out.length)await sr('football_lineups_cache?on_conflict=fixture_id',{method:'POST',body:JSON.stringify(out)});return out.length;
}
function cronAllowed(req){const secret=process.env.CRON_SECRET;if(!secret)return false;return String(req.headers.authorization||'')===`Bearer ${secret}`;}
module.exports=async function handler(req,res){
  if(!process.env.CRON_SECRET)return res.status(500).json({ok:false,code:'CRON_SECRET_MISSING'});if(!cronAllowed(req))return res.status(401).json({ok:false,code:'CRON_AUTH'});
  if(!KEY()||!SERVICE)return res.status(500).json({ok:false,code:'ENV_MISSING',need:['API_FOOTBALL_KEY_1..API_FOOTBALL_KEY_9','SUPABASE_SERVICE_ROLE_KEY']});
  const budget={used:await currentUsed()};budget.start=budget.used;const start=budget.used,meta={};
  try{
    const comps=await getCompetitions(budget);const fixtures=await syncFixtures(comps,budget);const odds=await syncOdds(comps,fixtures,budget);const lineups=await syncLineups(fixtures,budget);
    Object.assign(meta,{version:'1.042',mode:'CACHE_ONLY',competitions:comps.length,fixtures:fixtures.length,odds,lineups,requests_this_run:budget.used-start,daily_budget:MAX_DAILY,run_budget:MAX_RUN});
    await saveUsed(budget.used,meta);
    await sr('football_sync_state?on_conflict=job_name',{method:'POST',body:JSON.stringify([{job_name:'inca_v1042_pro_sync',last_success_at:new Date().toISOString(),status:'ok',meta}])});
    return res.status(200).json({ok:true,...meta,requests_today:budget.used});
  }catch(e){
    meta.error=e.message;await saveUsed(budget.used,meta).catch(()=>{});
    await sr('football_sync_state?on_conflict=job_name',{method:'POST',body:JSON.stringify([{job_name:'inca_v1042_pro_sync',last_success_at:new Date().toISOString(),status:'partial',meta}])}).catch(()=>{});
    return res.status(200).json({ok:false,message:e.message,requests_today:budget.used,daily_budget:MAX_DAILY,run_budget:MAX_RUN});
  }
};
