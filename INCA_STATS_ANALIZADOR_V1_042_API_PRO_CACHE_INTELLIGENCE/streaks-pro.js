(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const norm = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(fc|afc|cf|club de futbol|football club)\b/gi, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
  const num = (value) => Number(value) || 0;
  const fmt = (value, decimals = 1) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('es-PE', { maximumFractionDigits: decimals, minimumFractionDigits: Number(value) % 1 ? decimals : 0 }) : '—';
  const fmtDate = (value) => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return String(value || '—');
    return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  };
  const fmtKickoff = (value) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-PE', { timeZone:'America/Lima', weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:true }).format(d) + ' · PE';
  };
  const range = (start, end, step = 1) => {
    const out = [];
    for (let value = start; value <= end + 1e-9; value += step) out.push(Number(value.toFixed(2)));
    return out;
  };
  const thresholdLines = (values, suffix = '') => values.flatMap((value) => ([
    { id: `over:${value}`, label: `Over ${value}${suffix}`, kind: 'number', direction: 'over', value },
    { id: `under:${value}`, label: `Under ${value}${suffix}`, kind: 'number', direction: 'under', value }
  ]));
  const yesNoLines = [
    { id: 'yes', label: 'Sí', kind: 'boolean', value: true },
    { id: 'no', label: 'No', kind: 'boolean', value: false }
  ];

  const metric = (label, category, getValue, lines, options = {}) => ({ label, category, getValue, lines, ...options });

  // 26 mercados que pueden tratarse como respaldados por bookmaker cuando exista cache real.
  // No significa que todos estén disponibles en todas las ligas/casas en todo momento.
  const ODDS_BACKED_26 = Object.freeze([
    'h2h','totals','alternate_totals','btts','draw_no_bet','h2h_3_way',
    'team_totals','alternate_team_totals','h2h_h1','h2h_3_way_h1','totals_h1',
    'alternate_totals_h1','team_totals_h1','alternate_team_totals_h1',
    'alternate_spreads_corners','alternate_totals_corners','alternate_spreads_cards',
    'alternate_team_totals_corners','alternate_totals_cards','btts_h1','correct_score',
    'correct_score_h1','corners_1x2','double_chance','double_chance_h1','halftime_fulltime'
  ]);

  // Mapeo de nuestras señales a mercados de cuota real. Lo que no tenga mapeo usa Modelo INCA.
  const ODDS_MARKET_BY_METRIC = Object.freeze({
    btts:'btts', totalGoals:'alternate_totals', teamGoalsFor:'alternate_team_totals', teamGoalsAgainst:'alternate_team_totals',
    firstHalfGoals:'alternate_totals_h1', matchResult:'h2h', doubleChance:'double_chance', halfResult:'h2h_3_way_h1',
    totalCorners:'alternate_totals_corners', teamCornersFor:'alternate_team_totals_corners', teamCornersAgainst:'alternate_team_totals_corners',
    cornersHandicap:'alternate_spreads_corners', totalCards:'alternate_totals_cards'
  });

  // Evita señales "regaladas" que rara vez son útiles como línea de apuesta.
  // Si no hay una línea razonable que cumpla los filtros, no se fuerza una señal.
  const PLAYABLE_LINE_RULES = Object.freeze({
    totalCorners:{overMin:7.5,underMin:7.5},
    teamCornersFor:{overMin:2.5,underMin:2.5},teamCornersAgainst:{overMin:2.5,underMin:2.5},
    eachTeamCorners:{overMin:1.5,underMin:1.5},firstHalfCorners:{overMin:2.5,underMin:2.5},
    secondHalfCorners:{overMin:2.5,underMin:2.5},cornersEachHalf:{overMin:1.5,underMin:1.5},
    totalCards:{overMin:2.5,underMin:2.5},teamCardsFor:{overMin:.5,underMin:.5},teamCardsAgainst:{overMin:.5,underMin:.5},
    totalOffsides:{overMin:1.5,underMin:1.5},teamOffsidesFor:{overMin:.5,underMin:.5},teamOffsidesAgainst:{overMin:.5,underMin:.5},
    totalGoals:{overMin:1.5,underMin:1.5},firstHalfGoals:{overMin:.5,underMin:.5},secondHalfGoals:{overMin:.5,underMin:.5}
  });

  const METRICS = {
    goals: {
      label: 'Goles', icon: 'fa-futbol', children: {
        btts: metric('Ambos equipos marcan', 'goals', (r) => num(r.own.Goles) > 0 && num(r.opp.Goles) > 0, yesNoLines, { short: 'BTTS' }),
        totalGoals: metric('Goles totales del partido', 'goals', (r) => num(r.own.Goles) + num(r.opp.Goles), thresholdLines(range(0.5, 5.5, 1)), { short: 'Goles totales' }),
        teamGoalsFor: metric('Goles a favor del equipo', 'goals', (r) => num(r.own.Goles), thresholdLines(range(0.5, 3.5, 1)), { short: 'Goles a favor' }),
        teamGoalsAgainst: metric('Goles recibidos por el equipo', 'goals', (r) => num(r.opp.Goles), thresholdLines(range(0.5, 3.5, 1)), { short: 'Goles en contra' }),
        firstHalfGoals: metric('Goles del primer tiempo', 'goals', (r) => num(r.own1.Goles) + num(r.opp1.Goles), thresholdLines(range(0.5, 3.5, 1)), { short: 'Goles 1T' }),
        secondHalfGoals: metric('Goles del segundo tiempo', 'goals', (r) => num(r.own2.Goles) + num(r.opp2.Goles), thresholdLines(range(0.5, 3.5, 1)), { short: 'Goles 2T' }),
        bothHalfGoals: metric('Gol en ambas mitades', 'goals', (r) => (num(r.own1.Goles) + num(r.opp1.Goles) > 0) && (num(r.own2.Goles) + num(r.opp2.Goles) > 0), yesNoLines, { short: 'Gol ambas mitades' })
      }
    },
    corners: {
      label: 'Córners', icon: 'fa-flag', children: {
        totalCorners: metric('Córners totales del partido', 'corners', (r) => num(r.own.Córners) + num(r.opp.Córners), thresholdLines([7.5,8.5,9.5,10.5,11.5,12.5]), { short: 'Córners totales' }),
        teamCornersFor: metric('Córners a favor', 'corners', (r) => num(r.own.Córners), thresholdLines(range(0.5, 10.5, 1)), { short: 'Córners a favor' }),
        teamCornersAgainst: metric('Córners recibidos', 'corners', (r) => num(r.opp.Córners), thresholdLines(range(0.5, 10.5, 1)), { short: 'Córners en contra' }),
        cornersHandicap: metric('Hándicap de córners', 'corners', (r) => num(r.own.Córners) - num(r.opp.Córners), [
          { id: 'hc:0', label: 'Más córners (0)', kind: 'handicap', value: 0 },
          { id: 'hc:1.5', label: 'Hándicap +1.5', kind: 'handicap', value: 1.5 },
          { id: 'hc:2.5', label: 'Hándicap +2.5', kind: 'handicap', value: 2.5 },
          { id: 'hc:-1.5', label: 'Hándicap -1.5', kind: 'handicap', value: -1.5 },
          { id: 'hc:-2.5', label: 'Hándicap -2.5', kind: 'handicap', value: -2.5 }
        ], { short: 'Hándicap córners' }),
        eachTeamCorners: metric('Córners de cada equipo', 'corners', (r) => ({ own: num(r.own.Córners), opp: num(r.opp.Córners) }), thresholdLines(range(0.5, 5.5, 1)), { short: 'Cada equipo córners', evaluator: 'each' }),
        firstHalfCorners: metric('Córners del primer tiempo', 'corners', (r) => num(r.own1.Córners) + num(r.opp1.Córners), thresholdLines(range(0.5, 8.5, 1)), { short: 'Córners 1T' }),
        secondHalfCorners: metric('Córners del segundo tiempo', 'corners', (r) => num(r.own2.Córners) + num(r.opp2.Córners), thresholdLines(range(0.5, 8.5, 1)), { short: 'Córners 2T' }),
        cornersEachHalf: metric('Córners en cada mitad', 'corners', (r) => ({ first: num(r.own1.Córners) + num(r.opp1.Córners), second: num(r.own2.Córners) + num(r.opp2.Córners) }), thresholdLines(range(0.5, 5.5, 1)), { short: 'Córners cada mitad', evaluator: 'halves' })
      }
    },
    discipline: {
      label: 'Tarjetas', icon: 'fa-clone', children: {
        totalBookingPoints: metric('Booking points totales', 'discipline', (r) => num(r.own['Puntos por Tarjetas']) + num(r.opp['Puntos por Tarjetas']), thresholdLines([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], ' pts'), { short: 'Booking points' }),
        teamBookingFor: metric('Booking points del equipo', 'discipline', (r) => num(r.own['Puntos por Tarjetas']), thresholdLines([10, 20, 30, 40, 50, 60], ' pts'), { short: 'BP equipo' }),
        teamBookingAgainst: metric('Booking points del rival', 'discipline', (r) => num(r.opp['Puntos por Tarjetas']), thresholdLines([10, 20, 30, 40, 50, 60], ' pts'), { short: 'BP rival' }),
        eachTeamBooking: metric('Booking points de cada equipo', 'discipline', (r) => ({ own: num(r.own['Puntos por Tarjetas']), opp: num(r.opp['Puntos por Tarjetas']) }), thresholdLines([10, 20, 30, 40, 50], ' pts'), { short: 'BP cada equipo', evaluator: 'each' }),
        totalCards: metric('Tarjetas totales', 'discipline', (r) => num(r.own.Tarjetas) + num(r.opp.Tarjetas), thresholdLines(range(0.5, 9.5, 1)), { short: 'Tarjetas totales' }),
        teamCardsFor: metric('Tarjetas del equipo', 'discipline', (r) => num(r.own.Tarjetas), thresholdLines(range(0.5, 5.5, 1)), { short: 'Tarjetas equipo' }),
        teamCardsAgainst: metric('Tarjetas del rival', 'discipline', (r) => num(r.opp.Tarjetas), thresholdLines(range(0.5, 5.5, 1)), { short: 'Tarjetas rival' }),
        eachTeamCards: metric('Tarjetas de cada equipo', 'discipline', (r) => ({ own: num(r.own.Tarjetas), opp: num(r.opp.Tarjetas) }), thresholdLines(range(0.5, 3.5, 1)), { short: 'Tarjetas cada equipo', evaluator: 'each' })
      }
    },
    result: {
      label: 'Resultado', icon: 'fa-trophy', children: {
        matchResult: metric('Resultado del partido', 'result', (r) => r.ownGoals > r.oppGoals ? 'win' : r.ownGoals === r.oppGoals ? 'draw' : 'loss', [
          { id: 'win', label: 'Victoria', kind: 'enum', value: 'win' },
          { id: 'draw', label: 'Empate', kind: 'enum', value: 'draw' },
          { id: 'loss', label: 'Derrota', kind: 'enum', value: 'loss' }
        ], { short: 'Resultado' }),
        doubleChance: metric('Doble oportunidad', 'result', (r) => r.ownGoals > r.oppGoals ? 'win' : r.ownGoals === r.oppGoals ? 'draw' : 'loss', [
          { id: 'winDraw', label: 'Victoria o empate', kind: 'set', value: ['win', 'draw'] },
          { id: 'winLoss', label: 'Victoria o derrota', kind: 'set', value: ['win', 'loss'] },
          { id: 'drawLoss', label: 'Empate o derrota', kind: 'set', value: ['draw', 'loss'] }
        ], { short: 'Doble oportunidad' }),
        halfResult: metric('Resultado del primer tiempo', 'result', (r) => {
          const own = num(r.own1.Goles), opp = num(r.opp1.Goles);
          return own > opp ? 'win' : own === opp ? 'draw' : 'loss';
        }, [
          { id: 'win', label: 'Victoria al descanso', kind: 'enum', value: 'win' },
          { id: 'draw', label: 'Empate al descanso', kind: 'enum', value: 'draw' },
          { id: 'loss', label: 'Derrota al descanso', kind: 'enum', value: 'loss' }
        ], { short: 'Resultado 1T' }),
        winsAnyHalf: metric('Gana alguna mitad', 'result', (r) => (num(r.own1.Goles) > num(r.opp1.Goles)) || (num(r.own2.Goles) > num(r.opp2.Goles)), yesNoLines, { short: 'Gana alguna mitad' }),
        unbeaten: metric('Equipo invicto', 'result', (r) => r.ownGoals >= r.oppGoals, yesNoLines, { short: 'Invicto' })
      }
    },
    attack: {
      label: 'Ataque', icon: 'fa-bullseye', children: {
        totalShots: metric('Tiros totales del partido', 'attack', (r) => num(r.own['Tiros Totales']) + num(r.opp['Tiros Totales']), thresholdLines(range(9.5, 39.5, 5)), { short: 'Tiros totales' }),
        teamShotsFor: metric('Tiros del equipo', 'attack', (r) => num(r.own['Tiros Totales']), thresholdLines(range(4.5, 24.5, 5)), { short: 'Tiros equipo' }),
        teamShotsAgainst: metric('Tiros del rival', 'attack', (r) => num(r.opp['Tiros Totales']), thresholdLines(range(4.5, 24.5, 5)), { short: 'Tiros rival' }),
        totalShotsOnTarget: metric('Tiros a puerta totales', 'attack', (r) => num(r.own['Tiros a Puerta']) + num(r.opp['Tiros a Puerta']), thresholdLines(range(2.5, 14.5, 1)), { short: 'Tiros a puerta' }),
        teamShotsOnTargetFor: metric('Tiros a puerta del equipo', 'attack', (r) => num(r.own['Tiros a Puerta']), thresholdLines(range(0.5, 8.5, 1)), { short: 'A puerta equipo' }),
        teamShotsOnTargetAgainst: metric('Tiros a puerta del rival', 'attack', (r) => num(r.opp['Tiros a Puerta']), thresholdLines(range(0.5, 8.5, 1)), { short: 'A puerta rival' }),
        firstHalfTotalShots: metric('Tiros totales · HT', 'attack', (r) => num(r.own1['Tiros Totales']) + num(r.opp1['Tiros Totales']), thresholdLines(range(5.5, 17.5, 1)), { short: 'Tiros totales HT' }),
        firstHalfTeamShotsFor: metric('Tiros del equipo · HT', 'attack', (r) => num(r.own1['Tiros Totales']), thresholdLines(range(1.5, 9.5, 1)), { short: 'Tiros equipo HT' }),
        firstHalfTeamShotsAgainst: metric('Tiros del rival · HT', 'attack', (r) => num(r.opp1['Tiros Totales']), thresholdLines(range(1.5, 9.5, 1)), { short: 'Tiros rival HT' }),
        firstHalfShotsOnTarget: metric('Tiros a puerta totales · HT', 'attack', (r) => num(r.own1['Tiros a Puerta']) + num(r.opp1['Tiros a Puerta']), thresholdLines(range(0.5, 7.5, 1)), { short: 'A puerta HT' }),
        firstHalfTeamShotsOnTargetFor: metric('Tiros a puerta equipo · HT', 'attack', (r) => num(r.own1['Tiros a Puerta']), thresholdLines(range(0.5, 4.5, 1)), { short: 'A puerta equipo HT' }),
        firstHalfTeamShotsOnTargetAgainst: metric('Tiros a puerta rival · HT', 'attack', (r) => num(r.opp1['Tiros a Puerta']), thresholdLines(range(0.5, 4.5, 1)), { short: 'A puerta rival HT' })
      }
    },
    play: {
      label: 'Juego', icon: 'fa-shuffle', children: {
        totalFouls: metric('Faltas totales', 'play', (r) => num(r.own.Faltas) + num(r.opp.Faltas), thresholdLines(range(14.5, 34.5, 1)), { short: 'Faltas totales' }),
        foulsCommitted: metric('Faltas cometidas', 'play', (r) => num(r.own.Faltas), thresholdLines(range(4.5, 17.5, 1)), { short: 'Faltas cometidas' }),
        foulsReceived: metric('Faltas recibidas', 'play', (r) => num(r.opp.Faltas), thresholdLines(range(4.5, 17.5, 1)), { short: 'Faltas recibidas' }),
        totalOffsides: metric('Offsides totales', 'play', (r) => num(r.own['Fueras de Juego']) + num(r.opp['Fueras de Juego']), thresholdLines(range(0.5, 8.5, 1)), { short: 'Offsides totales' }),
        teamOffsidesFor: metric('Offsides del equipo', 'play', (r) => num(r.own['Fueras de Juego']), thresholdLines(range(0.5, 4.5, 1)), { short: 'Offsides equipo' }),
        teamOffsidesAgainst: metric('Offsides del rival', 'play', (r) => num(r.opp['Fueras de Juego']), thresholdLines(range(0.5, 4.5, 1)), { short: 'Offsides rival' }),
        totalGoalKicks: metric('Saques de meta totales', 'play', (r) => num(r.own['Saques de Meta']) + num(r.opp['Saques de Meta']), thresholdLines(range(4.5, 24.5, 5)), { short: 'Saques de meta' }),
        teamGoalKicksFor: metric('Saques de meta del equipo', 'play', (r) => num(r.own['Saques de Meta']), thresholdLines(range(1.5, 14.5, 1)), { short: 'S. meta equipo' }),
        teamGoalKicksAgainst: metric('Saques de meta del rival', 'play', (r) => num(r.opp['Saques de Meta']), thresholdLines(range(1.5, 14.5, 1)), { short: 'S. meta rival' }),
        totalThrowIns: metric('Saques de banda totales', 'play', (r) => num(r.own['Saques de Banda']) + num(r.opp['Saques de Banda']), thresholdLines(range(19.5, 43.5, 1)), { short: 'Saques de banda' }),
        teamThrowInsFor: metric('Saques de banda del equipo', 'play', (r) => num(r.own['Saques de Banda']), thresholdLines(range(9.5, 22.5, 1)), { short: 'S. banda equipo' }),
        teamThrowInsAgainst: metric('Saques de banda del rival', 'play', (r) => num(r.opp['Saques de Banda']), thresholdLines(range(9.5, 22.5, 1)), { short: 'S. banda rival' }),
        totalTackles: metric('Tackles totales', 'play', (r) => num(r.own.Entradas) + num(r.opp.Entradas), thresholdLines(range(9.5, 39.5, 5)), { short: 'Tackles totales' }),
        teamTacklesFor: metric('Tackles del equipo', 'play', (r) => num(r.own.Entradas), thresholdLines(range(4.5, 24.5, 5)), { short: 'Tackles equipo' }),
        teamTacklesAgainst: metric('Tackles del rival', 'play', (r) => num(r.opp.Entradas), thresholdLines(range(4.5, 24.5, 5)), { short: 'Tackles rival' })
      }
    }
  };

  const state={category:'goals',metric:'totalGoals',results:[],current:null,initialized:false,fixtures:[],currentTeams:[],oddsCache:[],cacheLoaded:false,teamRowsCache:new Map()};
  function activeMetric(){return METRICS[state.category]?.children?.[state.metric]||METRICS.goals.children.totalGoals}
  function similarity(a,b){const A=norm(a),B=norm(b);if(!A||!B)return 0;if(A===B)return 1;if(A.includes(B)||B.includes(A))return .92;const aT=new Set(A.split(' ')),bT=new Set(B.split(' '));const c=[...aT].filter(x=>bT.has(x)).length;return c/Math.max(aT.size,bT.size,1)}
  async function authJson(url){const staticDev=/^(localhost|127\.0\.0\.1)$/i.test(location.hostname)&&!/^300\d$/.test(location.port||'');if(staticDev)throw new Error('LOCAL_STATIC_API_DISABLED');let token='';try{const s=await window.INCA_AUTH?.client?.auth?.getSession?.();token=s?.data?.session?.access_token||''}catch{}const h={accept:'application/json'};if(token)h.Authorization=`Bearer ${token}`;const r=await fetch(url,{cache:'default',headers:h});if(!r.ok)throw new Error(`HTTP_${r.status}`);return r.json()}
  async function loadCache(){if(state.cacheLoaded)return;state.cacheLoaded=true;try{const [a,b,c]=await Promise.all([authJson('./api/football-cache?action=teams'),authJson('./api/football-cache?action=fixtures&hours=48'),authJson('./api/football-cache?action=odds&hours=48').catch(()=>({odds:[]}))]);state.currentTeams=a?.teams||[];state.fixtures=b?.fixtures||[];state.oddsCache=c?.odds||[]}catch{try{const [a,b,c]=await Promise.all([fetch('./data/live/current_teams.json').then(r=>r.json()),fetch('./data/live/fixtures_next.json').then(r=>r.json()),fetch('./data/live/odds_next.json').then(r=>r.json()).catch(()=>({odds:[]}))]);state.currentTeams=a?.teams||[];state.fixtures=b?.fixtures||[];state.oddsCache=c?.odds||[]}catch{state.currentTeams=[];state.fixtures=[];state.oddsCache=[]}}}
  function logoFor(team,id){return window.INCA_TITAN?.logoUrl?.(team,id)||window.obtenerEscudoEquipo?.(team)||''}
  function stat(row,key){if(!row)return 0;const map={Goles:['Goals','Goles'],'Córners':['Corner kicks','Córners','Corners'],'Tiros Totales':['Total shots','Tiros Totales'],'Tiros a Puerta':['Shots on target','Tiros a Puerta'],'Faltas':['Fouls','Faltas'],'Fueras de Juego':['Offsides','Fueras de Juego'],'Saques de Meta':['Goal kicks','Saques de Meta'],'Saques de Banda':['Throw-ins','Saques de Banda'],'Entradas':['Total tackles','Tackles','Entradas']};if(key==='Tarjetas'){const y=Number(row['Yellow cards']??row['Tarjetas Amarillas']??0),r=Number(row['Red cards']??row['Tarjetas Rojas']??0);return y+r}if(key==='Puntos por Tarjetas'){const y=Number(row['Yellow cards']??row['Tarjetas Amarillas']??0),r=Number(row['Red cards']??row['Tarjetas Rojas']??0),syr=Number(row['Second_Yellow_Reds']??row['second_yellow_red']??0);return window.INCA_TITAN?.bookingPointsInca?window.INCA_TITAN.bookingPointsInca(y,r,syr):(r>0?r*20+(y>0?10:0):y*10)}for(const k of map[key]||[key]){if(row[k]!==undefined&&row[k]!==null&&row[k]!==''){const v=Number(String(row[k]).replace('%','').replace(',','.'));if(Number.isFinite(v))return v}}return 0}
  function legacy(row){return{'Goles':stat(row,'Goles'),'Córners':stat(row,'Córners'),'Tarjetas':stat(row,'Tarjetas'),'Puntos por Tarjetas':stat(row,'Puntos por Tarjetas'),'Tiros Totales':stat(row,'Tiros Totales'),'Tiros a Puerta':stat(row,'Tiros a Puerta'),'Faltas':stat(row,'Faltas'),'Fueras de Juego':stat(row,'Fueras de Juego'),'Saques de Meta':stat(row,'Saques de Meta'),'Saques de Banda':stat(row,'Saques de Banda'),'Entradas':stat(row,'Entradas')}}
  function pairMap(history){const m=new Map();for(const r of history.allRows||[]){const e=String(r.Event_ID||''),p=String(r.Tiempo||'').toUpperCase(),id=Number(r.Team_ID);if(!e||!id)continue;const k=`${e}|${p}`;if(!m.has(k))m.set(k,new Map());m.get(k).set(id,r)}return m}
  function dateMs(v){const d=new Date(v);return Number.isNaN(d.getTime())?0:d.getTime()}
  async function rowsForTeam(source){const cacheKey=`${source.sofaId}|${source.compId}`;if(state.teamRowsCache.has(cacheKey))return state.teamRowsCache.get(cacheKey);const promise=(async()=>{const h=await window.INCA_TITAN.loadTeamHistory(source.sofaId);const current=window.INCA_TITAN?.currentSeasonForCompetition?.(Number(source.compId))||null;const contexts=(window.INCA_TITAN.teamContexts(source.sofaId,null)||[]).filter(c=>Number(c.competition_id)===Number(source.compId));const ctx=current?contexts.find(c=>Number(c.season_id)===Number(current.season_id)):null;if(!ctx)return[];const pairs=pairMap(h),ownId=Number(source.sofaId),events=new Map();for(const row of h.rows||[]){if(Number(row.Competition_ID)!==Number(ctx.competition_id)||Number(row.Season_ID)!==Number(ctx.season_id))continue;const e=String(row.Event_ID||''),p=String(row.Tiempo||'').toUpperCase();if(!['ALL','1ST','2ND'].includes(p))continue;if(!events.has(e))events.set(e,{});events.get(e)[p]=row}const out=[];for(const [eid,parts] of events){const own=parts.ALL;if(!own)continue;const pair=pairs.get(`${eid}|ALL`),oppEntry=pair?[...pair.entries()].find(([id])=>Number(id)!==ownId):null;if(!oppEntry)continue;const [oppId,opp]=oppEntry;const p1=pairs.get(`${eid}|1ST`),p2=pairs.get(`${eid}|2ND`),own1=parts['1ST']||null,own2=parts['2ND']||null,opp1=p1?.get(Number(oppId))||null,opp2=p2?.get(Number(oppId))||null;const isHome=String(own.Condicion||'').toUpperCase()==='LOCAL';out.push({match:{eventId:eid,fecha:own.Fecha,sortTime:dateMs(own.Fecha),local:isHome?source.name:String(opp.Equipo||'Rival'),visita:isHome?String(opp.Equipo||'Rival'):source.name},team:source.name,isHome,condition:isHome?'Local':'Visitante',opponent:String(opp.Equipo||'Rival'),own:legacy(own),opp:legacy(opp),own1:legacy(own1),opp1:legacy(opp1),own2:legacy(own2),opp2:legacy(opp2),ownGoals:stat(own,'Goles'),oppGoals:stat(opp,'Goles')})}return out.sort((a,b)=>b.match.sortTime-a.match.sortTime)})();state.teamRowsCache.set(cacheKey,promise);try{return await promise}catch(e){state.teamRowsCache.delete(cacheKey);return[]}}
  function evaluate(value,line,metricDef){if(metricDef.evaluator==='each'){if(!value||typeof value!=='object')return false;return line.direction==='under'?value.own<line.value&&value.opp<line.value:value.own>line.value&&value.opp>line.value}if(metricDef.evaluator==='halves'){if(!value||typeof value!=='object')return false;return line.direction==='under'?value.first<line.value&&value.second<line.value:value.first>line.value&&value.second>line.value}if(line.kind==='number')return line.direction==='under'?Number(value)<line.value:Number(value)>line.value;if(line.kind==='boolean'||line.kind==='enum')return value===line.value;if(line.kind==='set')return line.value.includes(value);if(line.kind==='handicap')return Number(value)+line.value>0;return false}
  function displayValue(value,metricDef){if(typeof value==='boolean')return value?'Sí':'No';if(typeof value==='string')return({win:'Victoria',draw:'Empate',loss:'Derrota'}[value]||value);if(value&&typeof value==='object'){if(metricDef.evaluator==='each')return`${fmt(value.own)} / ${fmt(value.opp)}`;if(metricDef.evaluator==='halves')return`${fmt(value.first)} / ${fmt(value.second)}`}return fmt(value)}
  function consecutive(rows){let n=0;for(const r of rows){if(!r.hit)break;n++}return n}
  function lineDifficulty(line,lines){if(line.kind!=='number')return .5;const vals=lines.filter(x=>x.kind==='number'&&x.direction===line.direction).map(x=>Number(x.value)).sort((a,b)=>a-b);if(vals.length<2)return .5;const min=vals[0],max=vals.at(-1),x=Number(line.value);return line.direction==='over'?(x-min)/(max-min):(max-x)/(max-min)}
  function isPlayableLine(metricKey,line){
    if(line.kind!=='number')return true;
    const rule=PLAYABLE_LINE_RULES[metricKey];if(!rule)return true;
    const x=Number(line.value);
    if(line.direction==='over'&&Number.isFinite(rule.overMin)&&x<rule.overMin)return false;
    if(line.direction==='under'&&Number.isFinite(rule.underMin)&&x<rule.underMin)return false;
    return true;
  }
  function conservativeProbability(hits,n){return n>0?(hits+2)/(n+4):0}
  function metricPolicy(metricKey){return window.INCA_ODDS_POLICY?.policyFor?.(metricKey)||{mode:oddsMarketForMetric(metricKey)?'MODEL':'STREAK_ONLY',realMarkets:oddsMarketForMetric(metricKey)?[oddsMarketForMetric(metricKey)]:[]}}
  function oddsMarketsForMetric(metricKey){const p=window.INCA_ODDS_POLICY?.policyFor?.(metricKey);if(p?.realMarkets?.length)return p.realMarkets;const key=ODDS_MARKET_BY_METRIC[metricKey]||null;return key&&ODDS_BACKED_26.includes(key)?[key]:[]}
  function oddsMarketForMetric(metricKey){return oddsMarketsForMetric(metricKey)[0]||null}
  function linePointMatch(line,point){if(line.kind!=='number'&&line.kind!=='handicap')return true;return Math.abs(Number(point)-Number(line.value))<.011}
  function cachedQuoteFor(source,metricKey,line){
    const markets=oddsMarketsForMetric(metricKey);if(!markets.length||!source?.fixture)return null;
    const fid=Number(source.fixture.fixture_id);const rows=state.oddsCache.filter(x=>Number(x.fixture_id)===fid&&markets.includes(x.market_key));let best=null;
    for(const x of rows){
      if(!linePointMatch(line,x.point))continue;
      if(line.direction&&x.direction&&String(x.direction)!==String(line.direction))continue;
      const price=Number(x.price);if(!(price>1))continue;
      if(!best||price>best.price)best={price,bookmaker:x.bookmaker||'',market:x.market_key,point:x.point,source:'book',fetchedAt:x.fetched_at||null};
    }
    return best;
  }
  function meanVariance(values){if(!values.length)return{mean:0,variance:0};const mean=values.reduce((a,b)=>a+b,0)/values.length;const variance=values.length>1?values.reduce((a,b)=>a+(b-mean)**2,0)/(values.length-1):mean;return{mean,variance}}
  function poissonCdf(k,lambda){if(k<0)return 0;if(!(lambda>=0))return 0;let term=Math.exp(-lambda),sum=term;for(let i=1;i<=k;i++){term*=lambda/i;sum+=term}return Math.min(1,Math.max(0,sum))}
  function nbCdf(k,mean,variance){if(k<0)return 0;if(!(mean>0)||!(variance>mean))return poissonCdf(k,mean);const r=mean*mean/(variance-mean),p=r/(r+mean);if(!(r>0&&p>0&&p<1))return poissonCdf(k,mean);let term=Math.pow(p,r),sum=term;for(let i=1;i<=k;i++){term*=((i-1+r)/i)*(1-p);sum+=term;if(term<1e-12&&i>k)break}return Math.min(1,Math.max(0,sum))}
  function numericParametricProbability(values,line,category){
    if(!values.length||line.kind!=='number')return null;const {mean,variance}=meanVariance(values);if(!(mean>=0))return null;
    const k=Math.floor(Number(line.value));let cdf,model='Poisson';
    const useNB=['corners','discipline'].includes(category)&&variance>mean*1.08&&mean>0;
    if(useNB){cdf=nbCdf(k,mean,variance);model='Binomial Negativa'}else cdf=poissonCdf(k,mean);
    const prob=line.direction==='over'?1-cdf:cdf;return{prob:Math.min(.995,Math.max(.005,prob)),model,mean,variance};
  }
  function estimatedQuote(prob,category,n){
    if(!(prob>0&&prob<1))return null;const fair=1/prob;const margin={goals:.045,corners:.06,discipline:.07,result:.045}[category]??.065;
    const center=Math.max(1.01,fair*(1-margin));const low=Math.max(1.01,fair*(1-margin*1.55));const high=Math.max(low,Math.min(15,fair*(1-margin*.35)));
    const confidence=n>=20?'ALTA':n>=12?'MEDIA':'BAJA';return{fair,center,low,high,confidence,margin};
  }
  function estimateForLine(records,line,metricDef,hits){
    const n=records.length,emp=conservativeProbability(hits,n);let probability=emp,model='Beta-Empírico',distribution=null;
    if(line.kind==='number'){
      const values=records.map(r=>metricDef.getValue(r)).filter(v=>typeof v==='number'&&Number.isFinite(v));
      const param=numericParametricProbability(values,line,metricDef.category);
      if(param){const w=n>=20?.72:n>=12?.58:.42;probability=param.prob*w+emp*(1-w);model=`${param.model} + empírico`;distribution=param}
    }
    probability=Math.min(.985,Math.max(.015,probability));return{probability,model,distribution,quote:estimatedQuote(probability,metricDef.category,n)};
  }
  function chooseAutoLine(records,metricDef,metricKey,threshold,minMatches,expectedOdds){
    const policy=metricPolicy(metricKey);const required=policy.mode==='STREAK_ONLY'?threshold:Math.max(threshold,100/Math.max(1.01,expectedOdds));let best=null;
    for(const line of metricDef.lines){
      if(!isPlayableLine(metricKey,line))continue;
      const rows=records.map(r=>{const value=metricDef.getValue(r);return{...r,value,valueText:displayValue(value,metricDef),hit:evaluate(value,line,metricDef)}});
      if(rows.length<minMatches)continue;
      const hits=rows.filter(r=>r.hit).length,pct=hits/rows.length*100,streak=consecutive(rows);if(streak<minMatches||pct+1e-9<required)continue;
      const estimate=estimateForLine(rows,line,metricDef,hits),difficulty=lineDifficulty(line,metricDef.lines);
      const center=estimate?.quote?.center;const targetFit=policy.mode==='MODEL'&&center?Math.max(0,12-Math.abs(center-expectedOdds)*8):0;
      const score=streak*7+pct*.35+difficulty*12+targetFit+Math.min(rows.length,25)*.08;
      if(!best||score>best.score)best={line,rows,hits,n:rows.length,percentage:pct,streak,score,average:averageValue(rows),estimate,policy};
    }
    return best;
  }
  function averageValue(rows){const v=rows.map(r=>typeof r.value==='number'?r.value:null).filter(x=>x!==null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
  function sources(){const scope=$('streakLeagueScopePro')?.value||'ALL',now=Date.now()-3600000;let fx=state.fixtures.filter(f=>new Date(f.kickoff_utc).getTime()>=now);if(scope!=='ALL')fx=fx.filter(f=>Number(f.sofascore_competition_id)===Number(scope));const map=new Map();for(const f of fx){for(const side of['home','away']){const sofaId=Number(f[`${side}_sofascore_team_id`]);if(!sofaId)continue;const name=f[`${side}_team_name`],compId=Number(f.sofascore_competition_id);map.set(`${sofaId}|${compId}`,{sofaId,name,compId,league:f.league_name,fixture:f})}}return[...map.values()]}
  function fallbackSources(){const scope=Number($('streakLeagueScopePro')?.value);if(!scope)return[];const seasons=(window.INCA_TITAN?.getCatalog?.()?.seasons||[]).filter(s=>Number(s.competition_id)===scope).sort((a,b)=>Number(b.season_status==='CURRENT')-Number(a.season_status==='CURRENT')||(Number(b.start_year)||0)-(Number(a.start_year)||0));const season=seasons[0];return(window.INCA_TITAN?.teamsForCompetitionSeason?.(scope,Number(season?.season_id))||[]).map(t=>({sofaId:Number(t.team_id),name:t.name,compId:scope,league:(window.INCA_TITAN.CURATED_COMPETITIONS||[]).find(x=>Number(x.id)===scope)?.name||'',fixture:null}))}
  function fixtureSummary(item){const f=item.source.fixture;if(!f)return{title:'Agenda pendiente',meta:'La sincronización la realiza el administrador'};const home=Number(f.home_sofascore_team_id)===Number(item.source.sofaId);return{title:`${home?'Local':'Visitante'} vs ${home?f.away_team_name:f.home_team_name}`,meta:fmtKickoff(f.kickoff_utc)}}
  function populateCategories(){const bar=$('streakCategoryBar');if(!bar)return;bar.innerHTML=Object.entries(METRICS).map(([k,c])=>`<button class="streak-category-btn ${k===state.category?'active':''}" data-category="${k}" type="button"><i class="fa-solid ${c.icon}"></i>${esc(c.label)}</button>`).join('');bar.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.category;state.metric=Object.keys(METRICS[state.category].children)[0];populateCategories();populateMetrics();runAnalysis()})}
  function syncPolicyField(){const input=$('streakExpectedOddsPro'),field=input?.closest('.streak-pro-field');if(!input)return;const p=metricPolicy(state.metric),streakOnly=p.mode==='STREAK_ONLY';input.disabled=streakOnly;input.title=streakOnly?'Este mercado usa SOLO RACHA si no existe una cuota real cacheada.':'Objetivo de precio para seleccionar una línea modelo.';field?.classList.toggle('streak-field-disabled',streakOnly)}
  function populateMetrics(){const s=$('streakMetricPro');if(!s)return;const c=METRICS[state.category].children;s.innerHTML=Object.entries(c).map(([k,v])=>`<option value="${k}">${esc(v.label)}</option>`).join('');if(!c[state.metric])state.metric=Object.keys(c)[0];s.value=state.metric;syncPolicyField()}
  function populateLeagues(){const s=$('streakLeagueScopePro');if(!s)return;s.innerHTML='<option value="ALL">Todas las ligas</option>'+(window.INCA_TITAN?.CURATED_COMPETITIONS||[]).map(x=>`<option value="${x.id}">${esc(x.country)} · ${esc(x.name)}</option>`).join('')}
  function setStatus(text,mode='ready',meta=''){const b=$('streakFixtureStatus');if(!b)return;b.className=`streak-pro-status ${mode}`;b.innerHTML=`<span class="streak-pro-dot"></span><div><strong>${esc(text)}</strong><small id="streakFixtureStatusMeta">${esc(meta)}</small></div>`}
  function hitDots(rows){return rows.slice(0,12).map(r=>`<span class="streak-run-dot ${r.hit?'hit':'miss'}"></span>`).join('')}
  function splitStats(records,line,metricDef){const one=rs=>{const n=rs.length;if(!n)return{n:0,hits:0,pct:0};const hits=rs.filter(r=>evaluate(metricDef.getValue(r),line,metricDef)).length;return{n,hits,pct:hits/n*100}};return{overall:one(records),home:one(records.filter(r=>r.condition==='Local')),away:one(records.filter(r=>r.condition==='Visitante'))}}
  async function analyzeSource(source,metricDef,threshold,minMatches,expectedOdds,condition){
    const allRows=await rowsForTeam(source);let rows=allRows.filter(r=>condition==='global'||r.condition.toLowerCase()===condition);const cand=chooseAutoLine(rows,metricDef,state.metric,threshold,minMatches,expectedOdds);if(!cand)return null;const splits=splitStats(allRows,cand.line,metricDef);
    const quote=cachedQuoteFor(source,state.metric,cand.line);let lineSource='STREAK_ONLY',displayOdds=null,priceMeta=null;
    if(quote){lineSource='REAL';displayOdds=quote.price;priceMeta={label:'CUOTA REAL',detail:quote.bookmaker||'Bookmaker'}}
    else if(cand.policy.mode==='MODEL'&&cand.estimate?.quote?.confidence!=='BAJA'){
      lineSource='ESTIMATED';displayOdds=cand.estimate.quote.center;priceMeta={label:'CUOTA ESTIMADA',detail:`${cand.estimate.quote.low.toFixed(2)}–${cand.estimate.quote.high.toFixed(2)} · NO BOOKMAKER`};
    }else{priceMeta={label:'SOLO RACHA',detail:'Sin mercado/línea confirmada'}}
    return{...cand,source,team:source.name,condition,metricDef,expectedOdds,quote,lineSource,displayOdds,priceMeta,splits,oddsMarkets:oddsMarketsForMetric(state.metric)};
  }
  async function runAnalysis(){
    const host=$('streakResultPro');if(host)host.innerHTML='<div class="streak-pro-loader"><span></span> INCA está recalculando con TITAN + caché…</div>';
    await window.INCA_TITAN?.ensureReady?.();await window.INCA_TITAN?.ensureTeamDetails?.().catch(()=>[]);await loadCache();let list=sources();if(!list.length)list=fallbackSources();const scope=$('streakLeagueScopePro')?.value||'ALL';
    if(!list.length&&scope==='ALL'){state.results=[];renderResults();setStatus('Agenda aún no precargada','error','El administrador debe ejecutar la sincronización central.');return}
    const metricDef=activeMetric(),threshold=Number($('streakThresholdPro')?.value||80),minMatches=Number($('streakMinMatchesPro')?.value||6),expectedOdds=Math.max(1.01,Number($('streakExpectedOddsPro')?.value||1.5)),condition=$('streakConditionPro')?.value||'global';const out=[];let i=0;
    async function worker(){while(i<list.length){const src=list[i++];const r=await analyzeSource(src,metricDef,threshold,minMatches,expectedOdds,condition);if(r)out.push(r)}}await Promise.all(Array.from({length:4},worker));
    state.results=out.sort((a,b)=>b.streak-a.streak||b.percentage-a.percentage||b.score-a.score);renderResults();syncMeta();const real=out.filter(x=>x.lineSource==='REAL').length,est=out.filter(x=>x.lineSource==='ESTIMATED').length,streak=out.filter(x=>x.lineSource==='STREAK_ONLY').length;
    setStatus(state.fixtures.length?'Agenda central cargada · filtros sin consumo externo':'Modo TITAN local · agenda pendiente','ready',`${real} cuota real · ${est} estimadas · ${streak} solo racha`);
  }
  function priceHtml(x){
    if(x.lineSource==='REAL')return `<div class="streak-odd real"><strong>${Number(x.displayOdds).toFixed(2)}</strong><small>CUOTA REAL · ${esc(x.quote?.bookmaker||'book')}</small></div>`;
    if(x.lineSource==='ESTIMATED')return `<div class="streak-odd model"><strong>~${Number(x.displayOdds).toFixed(2)}</strong><small>ESTIMADA · ${esc(x.priceMeta?.detail||'NO BOOKMAKER')}</small></div>`;
    return `<div class="streak-odd streak-only"><strong>—</strong><small>SOLO RACHA · SIN CUOTA</small></div>`;
  }
  function lineLabel(x){return x.lineSource==='REAL'?'LÍNEA REAL':x.lineSource==='ESTIMATED'?'LÍNEA MODELO':'CORTE ESTADÍSTICO'}
  function renderResults(){
    const host=$('streakResultPro');if(!host)return;const metricDef=activeMetric(),threshold=Number($('streakThresholdPro')?.value||80),minMatches=Number($('streakMinMatchesPro')?.value||6),expectedOdds=Number($('streakExpectedOddsPro')?.value||1.5);
    if(!state.results.length){host.innerHTML='<div class="streak-pro-empty"><i class="fa-solid fa-fire-flame-curved"></i><h3>Sin rachas con estos requisitos</h3><p>Prueba otra liga, baja el umbral o reduce Partidos mínimo. Los filtros recalculan automáticamente y no llaman APIs externas.</p></div>';return}
    host.innerHTML=`<div class="streak-pro-summary"><article><small>Equipos encontrados</small><strong>${state.results.length}</strong></article><article><small>Mercado</small><strong>${esc(metricDef.short)}</strong></article><article><small>Cuota objetivo</small><strong>${expectedOdds.toFixed(2)}</strong></article><article><small>Filtro</small><strong>${threshold}% · ${minMatches}+ PJ</strong></article></div><div class="streak-pro-table-wrap"><table class="streak-pro-table streak-pro-table-v20"><thead><tr><th>Equipo</th><th>Línea / corte INCA</th><th>Racha</th><th>Acierto</th><th>Últimos</th><th>Próximo de liga</th><th>Precio</th><th></th></tr></thead><tbody>${state.results.slice(0,100).map((x,i)=>{const fx=fixtureSummary(x),logo=logoFor(x.team,x.source.sofaId);return`<tr><td><div class="streak-team-cell">${logo?`<img class="streak-team-logo" src="${esc(logo)}" alt="" onerror="this.remove()">`:''}<div><strong>${esc(x.team)}</strong><small>${esc(x.source.league||'')} · ${esc(x.condition==='global'?'Global':x.condition)}</small></div></div></td><td><div class="streak-signal"><span class="streak-auto-line"><i class="fa-solid fa-chart-line"></i> ${esc(x.line.label)}</span><small>${lineLabel(x)} · ${x.hits}/${x.n} aciertos</small></div></td><td><span class="streak-percent elite">${x.streak}</span></td><td><span class="streak-percent ${x.percentage>=85?'elite':''}">${x.percentage.toFixed(0)}%</span></td><td><div class="streak-runs">${hitDots(x.rows)}</div></td><td><div class="streak-fixture"><strong>${esc(fx.title)}</strong><small>${esc(fx.meta)}</small></div></td><td>${priceHtml(x)}</td><td><button class="streak-view-btn" data-streak-index="${i}" type="button"><i class="fa-solid fa-table-list"></i> Ver</button></td></tr>`}).join('')}</tbody></table></div>`;
    host.querySelectorAll('[data-streak-index]').forEach(b=>b.onclick=()=>openModal(state.results[Number(b.dataset.streakIndex)]));
  }
  function syncMeta(){const scope=$('streakLeagueScopePro')?.value||'ALL',def=(window.INCA_TITAN?.CURATED_COMPETITIONS||[]).find(x=>String(x.id)===String(scope));if($('streakLeagueMeta'))$('streakLeagueMeta').textContent=def?def.name:'Todas las ligas';if($('streakSeasonMeta'))$('streakSeasonMeta').textContent='Temporada vigente';if($('streakDataMeta'))$('streakDataMeta').textContent=`${state.results.length} señales`}
  function openModal(item){
    if(!item)return;state.current=item;const modal=$('streakProModal'),content=$('streakModalContent');if(!modal||!content)return;const fx=fixtureSummary(item),logo=logoFor(item.team,item.source.sofaId);const price=item.lineSource==='REAL'?`${Number(item.displayOdds).toFixed(2)} · REAL`:item.lineSource==='ESTIMATED'?`~${Number(item.displayOdds).toFixed(2)} · ESTIMADA`:'SIN CUOTA';
    content.innerHTML=`<div class="streak-modal-head"><div class="streak-modal-team">${logo?`<img src="${esc(logo)}" alt="">`:''}<div><small>INCA STATS · ${lineLabel(item)}</small><h2>${esc(item.team)}</h2></div></div><button class="streak-modal-close" id="streakModalCloseInner"><i class="fa-solid fa-xmark"></i></button></div><div class="streak-modal-body"><div class="streak-modal-kpis"><article><small>Mercado</small><strong>${esc(item.metricDef.short)}</strong></article><article><small>Línea / corte</small><strong>${esc(item.line.label)}</strong></article><article><small>Racha</small><strong>${item.streak}</strong></article><article><small>Acierto</small><strong>${item.percentage.toFixed(0)}%</strong></article><article><small>Precio</small><strong>${esc(price)}</strong></article></div>${item.lineSource==='ESTIMATED'?`<div class="league-hub-note"><strong>CUOTA ESTIMADA · NO BOOKMAKER</strong><br>Rango aproximado ${item.estimate.quote.low.toFixed(2)}–${item.estimate.quote.high.toFixed(2)} · cuota justa ${item.estimate.quote.fair.toFixed(2)} · confianza ${esc(item.estimate.quote.confidence)} · ${esc(item.estimate.model)}.</div>`:''}${item.lineSource==='STREAK_ONLY'?`<div class="league-hub-note"><strong>SOLO RACHA</strong><br>INCA encontró un corte estadístico útil, pero no existe una línea/cuota real cacheada ni se considera prudente inventar un precio para este mercado.</div>`:''}<div class="streak-context-grid"><article><small>GLOBAL</small><strong>${item.splits.overall.pct.toFixed(1)}%</strong><span>${item.splits.overall.hits}/${item.splits.overall.n}</span></article><article><small>LOCAL</small><strong>${item.splits.home.pct.toFixed(1)}%</strong><span>${item.splits.home.hits}/${item.splits.home.n}</span></article><article><small>VISITA</small><strong>${item.splits.away.pct.toFixed(1)}%</strong><span>${item.splits.away.hits}/${item.splits.away.n}</span></article></div><div class="streak-modal-fixture"><div><small>PRÓXIMO PARTIDO DE LIGA</small><strong>${esc(fx.title)}</strong><small>${esc(fx.meta)}</small></div></div><div class="streak-pro-table-wrap"><table class="streak-mini-table"><thead><tr><th>Fecha</th><th>Condición</th><th>Partido</th><th>Valor</th><th>Resultado</th></tr></thead><tbody>${item.rows.map(r=>`<tr class="${r.hit?'hit':'miss'}"><td>${esc(fmtDate(r.match.sortTime||r.match.fecha))}</td><td>${esc(r.condition)}</td><td>${esc(r.match.local)} <b>vs</b> ${esc(r.match.visita)}</td><td><span class="streak-value-pill">${esc(r.valueText)}</span></td><td><span class="streak-result-pill ${r.hit?'hit':'miss'}">${r.hit?'CUMPLE':'NO CUMPLE'}</span></td></tr>`).join('')}</tbody></table></div></div><div class="streak-modal-actions"><button class="streak-pro-btn light" id="streakModalCloseBottom" type="button">Cerrar</button></div>`;
    modal.classList.add('open');modal.setAttribute('aria-hidden','false');$('streakModalCloseInner').onclick=closeModal;$('streakModalCloseBottom').onclick=closeModal;
  }
  function closeModal(){const m=$('streakProModal');m?.classList.remove('open');m?.setAttribute('aria-hidden','true')}
  function init(){
    if(state.initialized)return;state.initialized=true;populateCategories();populateMetrics();populateLeagues();let timer=null;const auto=()=>{clearTimeout(timer);timer=setTimeout(runAnalysis,120)};
    $('streakMetricPro')?.addEventListener('change',e=>{state.metric=e.target.value;syncPolicyField();auto()});['streakThresholdPro','streakMinMatchesPro','streakLeagueScopePro','streakConditionPro'].forEach(id=>$(id)?.addEventListener('change',auto));$('streakExpectedOddsPro')?.addEventListener('input',auto);
    $('streakResetPro')?.addEventListener('click',()=>{state.category='goals';state.metric='totalGoals';$('streakExpectedOddsPro').value='1.50';$('streakThresholdPro').value='80';$('streakMinMatchesPro').value='6';$('streakLeagueScopePro').value='ALL';$('streakConditionPro').value='global';populateCategories();populateMetrics();runAnalysis()});
    $('streakProModal')?.addEventListener('click',e=>{if(e.target.id==='streakProModal')closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});document.addEventListener('click',e=>{if(e.target.closest('[data-view="streaks"]'))setTimeout(runAnalysis,80)});setStatus('Los usuarios leen TITAN + caché: 0 llamadas externas por filtro','ready','Cuota REAL ≠ ESTIMADA ≠ SOLO RACHA');syncMeta();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.INCA_STREAKS_PRO=Object.freeze({run:runAnalysis,metrics:METRICS,oddsBacked26:ODDS_BACKED_26,playableRules:PLAYABLE_LINE_RULES});
})();
