(() => {
  'use strict';
  window.INCA_MODULES = window.INCA_MODULES || {};
  window.INCA_DIAGNOSTICO_ARQUITECTURA = () => ({
    version: window.INCA_ARCH?.version,
    indexedDB: Boolean(window.INCA_DB),
    worker: Boolean(window.INCA_DATA_WORKER?.available),
    virtualTable: Boolean(window.INCA_VIRTUAL_TABLE),
    modules: Object.keys(window.INCA_MODULES || {}),
    serviceWorker: 'serviceWorker' in navigator
  });
  window.addEventListener('load', () => {
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(location.hostname || '');
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      if (isLocal) {
        navigator.serviceWorker.getRegistrations?.().then(list => Promise.all(list.map(reg => reg.unregister().catch(() => false)))).catch(() => {});
        if ('caches' in window) caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('inca-stats-analizador-')).map(k => caches.delete(k)))).catch(() => {});
      } else {
        navigator.serviceWorker.register('./sw.js?v=1.021', { updateViaCache:'none' }).then(reg => reg.update().catch(() => {})).catch(err => console.warn('[INCA SW]',err));
      }
    }
    console.info('[INCA ARCH]', window.INCA_DIAGNOSTICO_ARQUITECTURA());
  }, { once:true });
})();
