(() => {
  'use strict';

  const TEAM_REAL_MARKETS = Object.freeze({
    btts: ['btts'],
    totalGoals: ['alternate_totals', 'totals'],
    teamGoalsFor: ['alternate_team_totals', 'team_totals'],
    teamGoalsAgainst: ['alternate_team_totals', 'team_totals'],
    firstHalfGoals: ['alternate_totals_h1', 'totals_h1'],
    matchResult: ['h2h', 'h2h_3_way'],
    doubleChance: ['double_chance'],
    halfResult: ['h2h_3_way_h1', 'h2h_h1'],
    totalCorners: ['alternate_totals_corners'],
    teamCornersFor: ['alternate_team_totals_corners'],
    teamCornersAgainst: ['alternate_team_totals_corners'],
    cornersHandicap: ['alternate_spreads_corners', 'corners_1x2'],
    totalCards: ['alternate_totals_cards'],
    teamCardsFor: ['alternate_spreads_cards'],
    teamCardsAgainst: ['alternate_spreads_cards']
  });

  const MODEL_ALLOWED = new Set([
    'btts','totalGoals','teamGoalsFor','teamGoalsAgainst','firstHalfGoals','secondHalfGoals','bothHalfGoals',
    'matchResult','doubleChance','unbeaten','winToNil','cleanSheet',
    'totalCorners','teamCornersFor','teamCornersAgainst','cornersHandicap','eachTeamCorners','firstHalfCorners','secondHalfCorners','cornersEachHalf',
    'totalCards','teamCardsFor','teamCardsAgainst','eachTeamCards'
  ]);

  // Estas métricas pueden producir un corte estadístico útil, pero no deben inventar una cuota/mercado.
  const STREAK_ONLY = new Set([
    'totalBookingPoints','teamBookingFor','teamBookingAgainst','eachTeamBooking',
    'totalShots','teamShotsFor','teamShotsAgainst','totalShotsOnTarget','teamShotsOnTargetFor','teamShotsOnTargetAgainst',
    'totalFouls','foulsCommitted','foulsReceived','totalOffsides','teamOffsidesFor','teamOffsidesAgainst',
    'totalGoalKicks','teamGoalKicksFor','teamGoalKicksAgainst','totalThrowIns','teamThrowInsFor','teamThrowInsAgainst',
    'totalTackles','teamTacklesFor','teamTacklesAgainst'
  ]);

  const SOCCER_PLAYER_PROPS = Object.freeze([
    'player_goal_scorer_anytime','player_first_goal_scorer','player_last_goal_scorer',
    'player_to_receive_card','player_to_receive_red_card','player_shots_on_target','player_shots','player_assists'
  ]);

  const PLAYER_PROP_LEAGUES = Object.freeze([
    'Premier League','Ligue 1','Bundesliga','Serie A','La Liga','MLS'
  ]);

  const HIGH_VALUE_DISCOVERY = Object.freeze([
    'h2h','alternate_totals','btts','double_chance','alternate_team_totals',
    'alternate_totals_corners','alternate_team_totals_corners','alternate_spreads_corners','corners_1x2',
    'alternate_totals_cards','alternate_spreads_cards'
  ]);

  // V57 · capa de precios desactivada para las 5 ligas que el proyecto trata como
  // fuera de cobertura. Todo lo demás (fixtures, TITAN, jugadores, rachas, árbitros) sigue activo.
  const NO_PRICE_COMPETITION_IDS = Object.freeze([325,390,155,406,242]);
  const hasPriceCoverage = (competitionId) => !NO_PRICE_COMPETITION_IDS.includes(Number(competitionId));

  const policyFor = (metricKey) => {
    const realMarkets = TEAM_REAL_MARKETS[metricKey] || [];
    if (STREAK_ONLY.has(metricKey)) return { mode:'STREAK_ONLY', realMarkets:[] };
    if (MODEL_ALLOWED.has(metricKey)) return { mode:'MODEL', realMarkets };
    return { mode:'STREAK_ONLY', realMarkets:[] };
  };

  window.INCA_ODDS_POLICY = Object.freeze({
    teamRealMarkets: TEAM_REAL_MARKETS,
    modelAllowed: MODEL_ALLOWED,
    streakOnly: STREAK_ONLY,
    soccerPlayerProps: SOCCER_PLAYER_PROPS,
    playerPropLeagues: PLAYER_PROP_LEAGUES,
    highValueDiscovery: HIGH_VALUE_DISCOVERY,
    noPriceCompetitionIds: NO_PRICE_COMPETITION_IDS,
    hasPriceCoverage,
    policyFor
  });
})();
