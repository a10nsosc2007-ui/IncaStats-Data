const VERSION='inca-stats-analizador-v1-041-player-faces-overlay-simple-bat';
const SHELL=`${VERSION}-shell`, DATA=`${VERSION}-data`, LOGOS=`${VERSION}-logos`, FACES=`${VERSION}-faces`;
const LIMITS={[FACES]:320,[LOGOS]:950,[DATA]:320};
const SHELL_FILES=['./','./index.html','./inca-stats.css','./player-props.js','./product-polish.js','./config.js','./auth-pro.js','./fast-launch.js','./storage/indexed-db.js','./data-client.js','./qualification-phases.js','./titan-data.js','./titan-fixtures.js','./titan-players-client.js','./titan-referees-client.js','./virtual-table.js','./app.js','./escaner.js','./pro-portal.js','./odds-market-policy.js','./streaks-pro.js','./league-center.js','./referee-center.js','./navigation-controller.js','./match-center-pro.js','./table-export.js','./league-logo-selects.js','./betting-core.js','./team-intel.js','./compare-cross-league.js','./inca-settings.js','./metrics-48.js','./global-rankings.js','./ui-friendly-status.js','./editorial-pro-ui.js','./home-carousel-v26.js','./mobile-selectors.js','./mobile-stability.js','./assets/brand/inca-stats-v26.webp','./assets/brand/inca-stats-v26-icon.png','./INCASTATS_CUPOS_FASES_31_CURRENT.json','./fast-assets/titan-season-files.json','./fast-assets/titan-core/manifest_global.json','./fast-assets/titan-core/teams.json','./fast-assets/titan-core/competitions.json','./fast-assets/titan-core/seasons.json','./modules/logos.js','./modules/faces.js','./modules/search.js','./modules/scanner.js','./modules/player-vip.js','./modules/leaderboard.js'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(SHELL_FILES)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('inca-stats-analizador-')&&!key.startsWith(VERSION)).map(key=>caches.delete(key)))));
  self.clients.claim();
});
async function trim(name){
  const max=LIMITS[name]; if(!max)return;
  const cache=await caches.open(name),keys=await cache.keys();
  while(keys.length>max){await cache.delete(keys.shift());}
}
function cacheName(req){
  const u=req.url;
  if(/TITAN_LOGOS_COMP|TITAN_LOGOS|logo|crest|badge|escudo/i.test(u))return LOGOS;
  if(/IncaStats_Caras|\/player\/.*\/image|\.(png|jpe?g|webp)(\?|$)/i.test(u))return FACES;
  if(/\.(csv|json)(\?|$)/i.test(u))return DATA;
  return SHELL;
}
async function staleWhileRevalidate(req,name){
  const cache=await caches.open(name);
  const hit=await cache.match(req);
  const fresh=fetch(req,{cache:'default'}).then(async res=>{
    if(res.ok){try{await cache.put(req,res.clone());await trim(name);}catch(_){}}
    return res;
  }).catch(()=>null);
  return hit || (await fresh) || Response.error();
}
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);

  // V22.3: fuentes externas pasan directo al navegador. El SW V13 intentaba
  // cachear respuestas RAW/CDN grandes y podía disparar Cache.put network error.
  if(url.origin!==self.location.origin)return;

  if(url.pathname.startsWith('/api/')){event.respondWith(fetch(req));return;}
  const name=cacheName(req);
  if(name===SHELL){
    event.respondWith(fetch(req).then(async res=>{
      if(res.ok){try{const c=await caches.open(SHELL);await c.put(req,res.clone());}catch(_){}}
      return res;
    }).catch(()=>caches.match(req)));
    return;
  }
  event.respondWith(staleWhileRevalidate(req,name));
});
