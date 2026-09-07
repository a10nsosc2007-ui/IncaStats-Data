(() => {
  'use strict';
  const THEME_KEY = 'theme';
  const LANG_KEY = 'inca_ui_language';
  const SUPPORTED = ['es','en','pt','fr','de'];

  const I18N = {
    es:{settings:'Configuración',system:'SISTEMA',appearance:'APARIENCIA',light:'Claro',dark:'Oscuro',language:'IDIOMA',saved:'Se guarda automáticamente en este navegador.',home:'Inicio',leagues:'Ligas',referees:'Árbitros',streaks:'Rachas',players:'Jugadores',compare:'Comparar',rankings:'Rankings',intel:'Team Intel',scanner:'Analizador',rankLeague:'LIGA',rankSeason:'TEMPORADA',rankMetric:'MÉTRICA VIP',rankMode:'MODO DE CÁLCULO',rankCondition:'CONDICIÓN',rankTeam:'EQUIPO',rankPosition:'POSICIÓN',rankShow:'MOSTRAR'},
    en:{settings:'Settings',system:'SYSTEM',appearance:'APPEARANCE',light:'Light',dark:'Dark',language:'LANGUAGE',saved:'Saved automatically in this browser.',home:'Home',leagues:'Leagues',referees:'Referees',streaks:'Streaks',players:'Players',compare:'Compare',rankings:'Rankings',intel:'Team Intel',scanner:'Analyzer',rankLeague:'LEAGUE',rankSeason:'SEASON',rankMetric:'VIP METRIC',rankMode:'CALCULATION MODE',rankCondition:'CONDITION',rankTeam:'TEAM',rankPosition:'POSITION',rankShow:'SHOW'},
    pt:{settings:'Configurações',system:'SISTEMA',appearance:'APARÊNCIA',light:'Claro',dark:'Escuro',language:'IDIOMA',saved:'Salvo automaticamente neste navegador.',home:'Início',leagues:'Ligas',referees:'Árbitros',streaks:'Sequências',players:'Jogadores',compare:'Comparar',rankings:'Rankings',intel:'Team Intel',scanner:'Analisador',rankLeague:'LIGA',rankSeason:'TEMPORADA',rankMetric:'MÉTRICA VIP',rankMode:'MODO DE CÁLCULO',rankCondition:'CONDIÇÃO',rankTeam:'EQUIPE',rankPosition:'POSIÇÃO',rankShow:'MOSTRAR'},
    fr:{settings:'Paramètres',system:'SYSTÈME',appearance:'APPARENCE',light:'Clair',dark:'Sombre',language:'LANGUE',saved:'Enregistré automatiquement dans ce navigateur.',home:'Accueil',leagues:'Ligues',referees:'Arbitres',streaks:'Séries',players:'Joueurs',compare:'Comparer',rankings:'Classements',intel:'Team Intel',scanner:'Analyseur',rankLeague:'LIGUE',rankSeason:'SAISON',rankMetric:'MÉTRIQUE VIP',rankMode:'MODE DE CALCUL',rankCondition:'CONDITION',rankTeam:'ÉQUIPE',rankPosition:'POSTE',rankShow:'AFFICHER'},
    de:{settings:'Einstellungen',system:'SYSTEM',appearance:'DARSTELLUNG',light:'Hell',dark:'Dunkel',language:'SPRACHE',saved:'Wird automatisch in diesem Browser gespeichert.',home:'Start',leagues:'Ligen',referees:'Schiedsrichter',streaks:'Serien',players:'Spieler',compare:'Vergleichen',rankings:'Rankings',intel:'Team Intel',scanner:'Analyzer',rankLeague:'LIGA',rankSeason:'SAISON',rankMetric:'VIP-METRIK',rankMode:'BERECHNUNGSMODUS',rankCondition:'BEDINGUNG',rankTeam:'TEAM',rankPosition:'POSITION',rankShow:'ANZEIGEN'}
  };
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const lang = () => SUPPORTED.includes(localStorage.getItem(LANG_KEY)) ? localStorage.getItem(LANG_KEY) : 'es';
  const tx = k => I18N[lang()]?.[k] ?? I18N.es[k] ?? k;

  function labelText(selector, value){
    const el = $(selector); if (!el) return;
    const icon = el.querySelector('i');
    if (icon){ [...el.childNodes].forEach(n => { if (n !== icon) n.remove(); }); el.append(document.createTextNode(' ' + value)); }
    else el.textContent = value;
  }
  function navText(view, value){
    const el = $(`.portal-nav-btn[data-view="${view}"]`); if (!el) return;
    const icon = el.querySelector('i');
    [...el.childNodes].forEach(n => { if (n !== icon) n.remove(); });
    el.append(document.createTextNode(' ' + value));
  }
  function applyLanguage(){
    const l = lang();
    document.documentElement.lang = l === 'es' ? 'es-PE' : l;
    const ids = {incaSettingsKicker:'system',incaSettingsTitle:'settings',incaAppearanceLabel:'appearance',incaLightLabel:'light',incaDarkLabel:'dark',incaLanguageLabel:'language',incaSettingsSaved:'saved'};
    Object.entries(ids).forEach(([id,key]) => { const el=document.getElementById(id); if(el) el.textContent=tx(key); });
    navText('home',tx('home')); navText('leagues',tx('leagues')); navText('referees',tx('referees')); navText('streaks',tx('streaks')); navText('players',tx('players')); navText('compare',tx('compare')); navText('rankings',tx('rankings')); navText('betlab',tx('intel')); navText('scanner',tx('scanner'));
    labelText('#vista-rankings label[for="rankingsSelectLiga"]',tx('rankLeague'));
    labelText('#vista-rankings label[for="rankingsSelectTemporada"]',tx('rankSeason'));
    labelText('#vista-rankings label[for="rankingsSelectMetrica"]',tx('rankMetric'));
    labelText('#vista-rankings label[for="rankingsSelectModo"]',tx('rankMode'));
    labelText('#vista-rankings label[for="rankingsSelectCondicion"]',tx('rankCondition'));
    labelText('#vista-rankings label[for="rankingsSelectEquipo"]',tx('rankTeam'));
    labelText('#vista-rankings label[for="rankingsSelectPosicion"]',tx('rankPosition'));
    labelText('#vista-rankings label[for="rankingsSelectLimite"]',tx('rankShow'));
    window.dispatchEvent(new CustomEvent('inca:languagechange',{detail:{language:l}}));
  }
  function applyTheme(_value, save=true){
    const v = 'light';
    document.body.classList.remove('dark-mode');
    if (save) localStorage.setItem(THEME_KEY,v);
    $$('[data-inca-theme]').forEach(b => b.classList.toggle('active',b.dataset.incaTheme===v));
  }
  function openMenu(){ const m=$('#incaSettingsMenu'); if(!m)return; m.hidden=false; requestAnimationFrame(()=>m.classList.add('open')); }
  function closeMenu(){ const m=$('#incaSettingsMenu'); if(!m)return; m.classList.remove('open'); setTimeout(()=>{if(!m.classList.contains('open'))m.hidden=true},130); }
  function init(){
    applyTheme('light',true);
    const select=$('#incaLanguageSelect'); if(select)select.value=lang();
    applyLanguage();
    $('#incaSettingsTrigger')?.addEventListener('click',e=>{e.stopPropagation(); const m=$('#incaSettingsMenu'); m?.classList.contains('open')?closeMenu():openMenu();});
    $('#incaSettingsClose')?.addEventListener('click',closeMenu);
    $$('[data-inca-theme]').forEach(b=>b.addEventListener('click',()=>applyTheme(b.dataset.incaTheme)));
    select?.addEventListener('change',()=>{localStorage.setItem(LANG_KEY,select.value);applyLanguage();});
    document.addEventListener('click',e=>{const m=$('#incaSettingsMenu');if(m?.classList.contains('open')&&!m.contains(e.target)&&!e.target.closest('#incaSettingsTrigger'))closeMenu();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
    window.INCA_SETTINGS={setTheme:applyTheme,setLanguage:(v)=>{if(SUPPORTED.includes(v)){localStorage.setItem(LANG_KEY,v);if(select)select.value=v;applyLanguage();}}};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
