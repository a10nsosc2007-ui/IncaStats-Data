(() => {
'use strict';

const MARKET_CONFIG = Object.freeze({
  goals: {
    label:'Goles', metric:'Goals',
    lines:{
      total:[0.5,1.5,2.5,3.5,4.5,5.5],
      team:[0.5,1.5,2.5,3.5],
      rival:[0.5,1.5,2.5,3.5]
    }
  },
  corners: {
    label:'Córners', metric:'Corner kicks',
    lines:{
      total:[3.5,4.5,5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5,13.5,14.5,15.5,16.5,17.5],
      team:[0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5,10.5],
      rival:[0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5,10.5]
    }
  },
  cards: {
    label:'Tarjetas', metric:'__cards',
    lines:{
      total:[0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5],
      team:[0.5,1.5,2.5,3.5,4.5,5.5],
      rival:[0.5,1.5,2.5,3.5,4.5,5.5]
    }
  },
  booking: {
    label:'Puntos de tarjetas', metric:'__booking',
    lines:{
      total:[10,20,30,40,50,60,70,80,90,100],
      team:[10,20,30,40,50,60],
      rival:[10,20,30,40,50,60]
    }
  },
  shots: {
    label:'Tiros totales', metric:'Total shots',
    lines:{
      total:[10.5,11.5,12.5,13.5,14.5,15.5,16.5,17.5,18.5,19.5,20.5,21.5,22.5,23.5,24.5,25.5,26.5,27.5,28.5,29.5,30.5,31.5,32.5,33.5,34.5,35.5],
      team:[5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5,13.5,14.5,15.5,16.5,17.5,18.5,19.5,20.5,21.5,22.5,23.5,24.5,25.5],
      rival:[5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5,13.5,14.5,15.5,16.5,17.5,18.5,19.5,20.5,21.5,22.5,23.5,24.5,25.5]
    }
  },
  sot: {
    label:'Tiros al arco', metric:'Shots on target',
    lines:{
      total:[3.5,4.5,5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5,13.5,14.5,15.5],
      team:[0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5,10.5],
      rival:[0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5,10.5]
    }
  },
  shots_ht: {
    label:'Tiros totales · HT', metric:'Total shots', period:'1ST',
    lines:{
      total:[5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5,13.5,14.5,15.5,16.5,17.5],
      team:[1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5],
      rival:[1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5]
    }
  },
  sot_ht: {
    label:'Tiros al arco · HT', metric:'Shots on target', period:'1ST',
    lines:{
      total:[0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5],
      team:[0.5,1.5,2.5,3.5,4.5],
      rival:[0.5,1.5,2.5,3.5,4.5]
    }
  },
  fouls: {
    label:'Faltas', metric:'Fouls',
    lines:{
      total:[15.5,16.5,17.5,18.5,19.5,20.5,21.5,22.5,23.5,24.5,25.5,26.5,27.5,28.5,29.5,30.5,31.5,32.5,33.5,34.5],
      team:[5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5,13.5,14.5,15.5,16.5,17.5],
      rival:[5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5,13.5,14.5,15.5,16.5,17.5]
    }
  },
  offsides: {
    label:'Fueras de juego', metric:'Offsides',
    lines:{
      total:[0.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5],
      team:[0.5,1.5,2.5,3.5,4.5,5.5],
      rival:[0.5,1.5,2.5,3.5,4.5,5.5]
    }
  },
  goalkicks: {
    label:'Saques de meta', metric:'Goal kicks',
    lines:{
      total:[8.5,9.5,10.5,11.5,12.5,13.5,14.5,15.5,16.5,17.5,18.5,19.5,20.5,21.5,22.5],
      team:[2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5],
      rival:[2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5,10.5,11.5,12.5]
    }
  },
  throwins: {
    label:'Saques de banda', metric:'Throw-ins',
    lines:{
      total:[25.5,26.5,27.5,28.5,29.5,30.5,31.5,32.5,33.5,34.5,35.5,36.5,37.5,38.5,39.5,40.5,41.5,42.5,43.5],
      team:[10.5,11.5,12.5,13.5,14.5,15.5,16.5,17.5,18.5,19.5,20.5,21.5,22.5],
      rival:[10.5,11.5,12.5,13.5,14.5,15.5,16.5,17.5,18.5,19.5,20.5,21.5,22.5]
    }
  },
  tackles: {
    label:'Entradas / tackles', metric:'__tackles',
    lines:{
      total:[20.5,21.5,22.5,23.5,24.5,25.5,26.5,27.5,28.5,29.5,30.5,31.5,32.5,33.5,34.5,35.5,36.5,37.5,38.5,39.5,40.5,41.5,42.5,43.5,44.5,45.5],
      team:[8.5,9.5,10.5,11.5,12.5,13.5,14.5,15.5,16.5,17.5,18.5,19.5,20.5,21.5,22.5,23.5,24.5,25.5],
      rival:[8.5,9.5,10.5,11.5,12.5,13.5,14.5,15.5,16.5,17.5,18.5,19.5,20.5,21.5,22.5,23.5,24.5,25.5]
    }
  }
});

const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
}[c]));

const num = value => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s || /^(?:null|nan|n\/a|undefined)$/i.test(s)) return null;
  const n = Number(s.replace('%','').replace(',','.'));
  return Number.isFinite(n) ? n : null;
};

function parseDate(value) {
  const s = String(value || '').trim();
  if (!s) return 0;
  const iso = /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(s).getTime() : NaN;
  if (Number.isFinite(iso)) return iso;
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[2])-1, Number(m[1])).getTime() || 0;
  return new Date(s).getTime() || 0;
}

function condition(row) {
  const v = String(row?.Condicion || '').trim().toUpperCase();
  if (v === 'LOCAL' || v === 'HOME') return 'home';
  if (v === 'VISITA' || v === 'AWAY' || v === 'VISITANTE') return 'away';
  return '';
}

function metricValue(row, metric) {
  if (!row) return null;
  if (metric === '__cards') {
    const y = num(row['Yellow cards']), r = num(row['Red cards']);
    if (y === null && r === null) return null;
    return (y || 0) + (r || 0);
  }
  if (metric === '__booking') {
    const y = num(row['Yellow cards']), r = num(row['Red cards']);
    const syr = num(row['Second_Yellow_Reds'] ?? row['second_yellow_red']) || 0;
    if (y === null && r === null) return null;
    return window.INCA_TITAN?.bookingPointsInca ? window.INCA_TITAN.bookingPointsInca(y||0,r||0,syr) : ((r||0)>0 ? (r||0)*20 + ((y||0)>0 ? 10 : 0) : (y||0)*10);
  }
  if (metric === '__tackles') {
    const total = num(row['Total tackles']);
    if (total !== null) return total;
    return num(row['Tackles']);
  }
  return num(row[metric]);
}

function curatedCompetitions() {
  return (window.INCA_TITAN?.CURATED_COMPETITIONS || []).map(x => ({
    id:Number(x.id), name:x.name, region:x.region, country:x.country
  }));
}

function seasonsFor(compId) {
  const seasons = (window.INCA_TITAN?.getCatalog?.()?.seasons || [])
    .filter(s => Number(s.competition_id) === Number(compId))
    .slice();
  seasons.sort((a,b) =>
    Number(b.season_status==='CURRENT')-Number(a.season_status==='CURRENT') ||
    (Number(b.start_year)||0)-(Number(a.start_year)||0) ||
    (Number(b.season_id)||0)-(Number(a.season_id)||0)
  );
  return seasons;
}

async function teamsFor(compId, seasonId) {
  await window.INCA_TITAN?.ensureReady?.();
  await window.INCA_TITAN?.ensureTeamDetails?.();
  // Lista desde el índice del manifest: no descarga todos los CSV para llenar el menú.
  return window.INCA_TITAN?.teamsForCompetitionSeason?.(Number(compId), Number(seasonId)) || [];
}

async function teamHistory(teamId) {
  return window.INCA_TITAN.loadTeamHistory(Number(teamId));
}

function contextsFor(teamId, anchorSeasonId) {
  return window.INCA_TITAN?.teamContexts?.(Number(teamId), Number(anchorSeasonId)) || [];
}

function contextMap(contexts) {
  return new Map(contexts.map(c => [String(c.key), c]));
}

function ownRows(history, {
  period='ALL',
  conditionFilter='global',
  tournament='ALL',
  anchorSeasonId=null
}={}) {
  const contexts = contextsFor(history.team.team_id, anchorSeasonId);
  const allowed = contextMap(contexts);
  const selected = String(tournament || 'ALL');

  return (history.rows || [])
    .filter(row => String(row.Tiempo || '').toUpperCase() === period)
    .filter(row => {
      const c = condition(row);
      if (conditionFilter === 'home' && c !== 'home') return false;
      if (conditionFilter === 'away' && c !== 'away') return false;
      return true;
    })
    .filter(row => {
      const key = `${Number(row.Competition_ID)}|${Number(row.Season_ID)}`;
      if (!allowed.has(key)) return false;
      return selected === 'ALL' || key === selected;
    })
    .map(row => {
      const key = `${Number(row.Competition_ID)}|${Number(row.Season_ID)}`;
      return {
        row,
        eventId:String(row.Event_ID),
        compId:Number(row.Competition_ID),
        seasonId:Number(row.Season_ID),
        context:allowed.get(key),
        date:String(row.Fecha || ''),
        sortTime:parseDate(row.Fecha),
        condition:condition(row)==='home'?'LOCAL':'VISITA'
      };
    })
    .sort((a,b) => b.sortTime-a.sortTime || Number(b.eventId)-Number(a.eventId));
}

function takeSample(rows, sample) {
  return String(sample) === 'ALL' ? rows.slice() : rows.slice(0, Math.max(1, Number(sample)||10));
}

function localPairIndex(history) {
  if (history.__pairIndex) return history.__pairIndex;
  const grouped = new Map();

  for (const row of (history.allRows || history.rows || [])) {
    const eventId = String(row.Event_ID || '').trim();
    const time = String(row.Tiempo || '').toUpperCase();
    const teamId = Number(row.Team_ID);
    if (!eventId || !teamId || !['ALL','1ST','2ND'].includes(time)) continue;
    const key = `${eventId}|${time}`;
    if (!grouped.has(key)) grouped.set(key, new Map());
    grouped.get(key).set(teamId, row);
  }

  Object.defineProperty(history, '__pairIndex', {
    value: grouped,
    configurable: true,
    enumerable: false
  });
  return grouped;
}

async function valuesFor(history, options={}) {
  const market = MARKET_CONFIG[options.market] || MARKET_CONFIG.goals;
  const mode = options.mode || 'team';
  const resolvedOptions = {
    ...options,
    period: options.period || market.period || 'ALL'
  };
  const baseRows = ownRows(history, resolvedOptions);
  const sampled = takeSample(baseRows, resolvedOptions.sample);
  const periodKey = String(resolvedOptions.period || 'ALL').toUpperCase();
  const result = [];

  if (mode === 'team') {
    for (const item of sampled) {
      const value = metricValue(item.row, market.metric);
      if (value === null) continue;
      const pair = localPairIndex(history).get(`${item.eventId}|${periodKey}`);
      const oppEntry = pair ? [...pair.entries()].find(([tid]) => Number(tid) !== Number(history.team.team_id)) : null;
      result.push({
        ...item,
        value,
        opponent: oppEntry ? String(oppEntry[1]?.Equipo || 'Rival') : 'Rival'
      });
    }
    return result;
  }

  // Cada teams_csv de TITAN ya trae las dos caras del partido.
  // Por eso rival/total se resuelve localmente: cero descargas extra.
  const pairs = localPairIndex(history);
  for (const item of sampled) {
    const pair = pairs.get(`${item.eventId}|${periodKey}`);
    if (!pair) continue;

    const ownId = Number(history.team.team_id);
    const own = pair.get(ownId) || item.row;
    const oppEntry = [...pair.entries()].find(([tid]) => Number(tid) !== ownId);
    if (!oppEntry) continue;

    const [, opp] = oppEntry;
    const a = metricValue(own, market.metric);
    const b = metricValue(opp, market.metric);
    if (b === null || (mode === 'total' && a === null)) continue;

    result.push({
      ...item,
      value: mode === 'rival' ? b : a + b,
      opponent: String(opp.Equipo || 'Rival')
    });
  }

  return result;
}

function summarize(rows, line, direction='over', oddsValue=null) {
  const vals = rows.map(r=>r.value).filter(Number.isFinite);
  const pushes = vals.filter(v=>v===line).length;
  const decisions = vals.filter(v=>v!==line);
  const hits = decisions.filter(v=>direction==='under'?v<line:v>line).length;
  const n = decisions.length;
  const rate = n ? hits/n : 0;
  const sorted=[...vals].sort((a,b)=>a-b);
  const median = sorted.length ? (sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2) : 0;
  const avg = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;

  let streak=0;
  for (const r of rows) {
    const hit = direction==='under'?r.value<line:r.value>line;
    if (!hit) break;
    streak++;
  }

  const fair = rate>0 ? 1/rate : null;
  const book = num(oddsValue);
  const implied = book && book>1 ? 1/book : null;
  const edge = implied!==null ? (rate-implied)*100 : null;
  const returnHist = book && book>1 ? (rate*book-1)*100 : null;

  return {
    rows, hits, n, pushes, rate:rate*100,
    avg, median, streak,
    fairOdds:fair,
    bookOdds:book,
    implied:implied!==null?implied*100:null,
    edgePP:edge,
    historicalReturn:returnHist
  };
}

async function analyze(history, options={}) {
  const rows = await valuesFor(history, options);
  return summarize(rows, Number(options.line), options.direction||'over', options.odds);
}

async function trend(history, options={}) {
  const out={};
  for (const sample of [5,10,15,20,'ALL']) {
    const rows=await valuesFor(history,{...options,sample});
    out[String(sample)] = summarize(rows, Number(options.line), options.direction||'over', options.odds);
  }
  return out;
}

function lines(marketKey, mode) {
  const market=MARKET_CONFIG[marketKey]||MARKET_CONFIG.goals;
  return market.lines[mode] || market.lines.team;
}

function marketOptionsHTML() {
  return Object.entries(MARKET_CONFIG).map(([key,m])=>`<option value="${key}">${esc(m.label)}</option>`).join('');
}

function lineOptionsHTML(marketKey, mode, current=null) {
  const arr=lines(marketKey,mode);
  const selected = arr.includes(Number(current)) ? Number(current) : arr[Math.floor(arr.length/2)] ?? arr[0];
  return arr.map(v=>`<option value="${v}" ${v===selected?'selected':''}>${v}</option>`).join('');
}

function tournamentOptions(teamId, anchorSeasonId) {
  const contexts=contextsFor(teamId,anchorSeasonId);
  return contexts;
}

async function findBestTrends(history, baseOptions={}) {
  const findings=[];
  // Bettor-facing markets only. No xG, possession or "big chances".
  for (const [marketKey, market] of Object.entries(MARKET_CONFIG)) {
    const mode='team';
    const rows=await valuesFor(history,{...baseOptions,market:marketKey,mode,sample:'ALL'});
    if (rows.length<8) continue;

    for (const line of market.lines.team) {
      for (const direction of ['over','under']) {
        const l10=summarize(rows.slice(0,10),line,direction);
        const l20=summarize(rows.slice(0,20),line,direction);
        const season=summarize(rows,line,direction);
        if (l10.n<5 || season.n<8) continue;
        const floor=Math.min(l10.rate,season.rate);
        if (floor<60) continue;
        const score=floor + Math.min(5,l10.streak)*1.5 + Math.min(20,season.n)*0.05;
        findings.push({
          marketKey,label:market.label,line,direction,
          l10,l20,season,score,
          fairOdds:floor>0?100/floor:null
        });
      }
    }
  }
  findings.sort((a,b)=>b.score-a.score || b.season.n-a.season.n);
  return findings;
}

window.INCA_BET_CORE = Object.freeze({
  MARKET_CONFIG, esc, num,
  curatedCompetitions, seasonsFor, teamsFor,
  teamHistory, tournamentOptions,
  lines, marketOptionsHTML, lineOptionsHTML,
  valuesFor, analyze, trend, findBestTrends
});
})();