(() => {
  'use strict';
  window.INCA_ARCH = Object.freeze({
    version: '1.042',
    dbName: 'inca-stats-pro-v5',
    dbVersion: 1,
    remoteTTL: 6 * 60 * 60 * 1000,
    playerTTL: 24 * 60 * 60 * 1000,
    maxFaceCache: 300,
    maxLogoCache: 180,
    maxDataCache: 120,
    titanEnabled: true,
    titanRawBase: 'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/TITAN_ALONSINHO_V1_GITHUB_READY/',
    titanCardsDetailedPath: 'csv/cards_detailed.csv',
    titanCardsDetailedUrl: './data/runtime/cards_detailed.csv',
    titanLogoRootBase: 'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/TITAN_LOGOS/',
    titanLogoRawBase: 'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/TITAN_LOGOS/logos_png/',
    titanCompetitionLogoRawBase: 'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/TITAN_LOGOS_COMP/logos_png/',
    titanTeamIntelProfilesUrl: 'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/team_profiles.json',
    titanTeamIntelProfilesFallbackUrls: [
      'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/TITAN_TEAM_INTEL/team_profiles.json',
      './data/team-intel/team_profiles.json'
    ],
    titanTeamIntelHonoursUrl: 'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/team_honours.json',
    titanTeamIntelHonoursFallbackUrls: [
      'https://raw.githubusercontent.com/a10nsosc2007-ui/IncaStats-Data/main/TITAN_TEAM_INTEL/team_honours.json',
      './data/team-intel/team_honours.json'
    ],
    titanReleaseUrl: 'https://github.com/a10nsosc2007-ui/IncaStats-Data/releases/download/titan-data-v1/TITAN_ALONSINHO_V1_FULL_DATA_RELEASE.zip',
    titanFixturesPortalUrl: './data/runtime/TITAN_FIXTURES_CORE_31_V4.json',
    titanFixturesFallbackUrls: [],
    titanFixturesRawUrl: './data/runtime/TITAN_FIXTURES_CORE_31_V4.json',
    titanFixturesRawFallbackUrls: [],
    workerUrl: './workers/data-worker.js?v=1.021',
    oddsApiKey: '',
    apiCacheEndpoint: './api/football-cache',
    apiMode: 'CACHE_ONLY',
    apiCacheHours: 336,
    apiPriceCoverageCount: 26,
    matchApiEndpoint: './api/match-center',
    lineupsApiEndpoint: './api/lineups',
    oddsEndpoint: './api/odds',
    liveWindowHours: 48,
    supabaseUrl: 'https://jijxmshpzcoalohlhhnb.supabase.co',
    supabasePublishableKey: 'sb_publishable_pBnQxsVcunuxJrXLDNQnbQ_KWIbEyHy'
  });
})();
