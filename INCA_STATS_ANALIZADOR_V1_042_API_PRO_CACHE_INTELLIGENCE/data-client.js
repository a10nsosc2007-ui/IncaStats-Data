(() => {
  'use strict';
  const cfg = window.INCA_ARCH;
  let seq = 0;
  const pending = new Map();
  let worker = null;

  try {
    worker = new Worker(cfg.workerUrl);
    worker.onmessage = ({ data }) => {
      const task = pending.get(data.id);
      if (!task) return;
      pending.delete(data.id);
      data.ok ? task.resolve(data.result) : task.reject(new Error(data.error));
    };
    worker.onerror = error => console.warn('[INCA WORKER]', error.message);
  } catch (error) {
    console.warn('[INCA WORKER] No disponible, se usará Papa Parse.', error);
  }

  function call(type, payload, transfer=[]) {
    if (!worker) return Promise.reject(new Error('Worker no disponible'));
    const id = ++seq;
    return new Promise((resolve,reject) => {
      pending.set(id,{resolve,reject});
      worker.postMessage({id,type,payload},transfer);
    });
  }

  window.INCA_DATA_WORKER = {
    available: Boolean(worker),
    parseCSV(text) { return call('PARSE_CSV',{text}); },
    parseCSVFiltered(text, filters={}) { return call('PARSE_CSV_FILTERED',{text,filters}); },
    buildSearchIndex(items,nameField) { return call('BUILD_SEARCH_INDEX',{items,nameField}); }
  };

  const nativeFetch = window.fetch.bind(window);
  const cacheable = url => /\.(?:csv|json)(?:\?|$)/i.test(String(url));
  const keyFor = url => `remote:${String(url)}`;

  window.fetch = async function incaCachedFetch(input, init={}) {
    const request = input instanceof Request ? input : new Request(input, init);
    if (request.method !== 'GET' || !cacheable(request.url) || init?.cache === 'no-store') {
      return nativeFetch(input, init);
    }

    const key = keyFor(request.url);
    const ttl = /jugadores_ids|rutas_imagenes|logos\.json/i.test(request.url)
      ? cfg.playerTTL : cfg.remoteTTL;
    let cached = null;
    try { cached = await window.INCA_DB?.get('datasets', key); } catch (_) {}

    if (cached && Date.now() - cached.timestamp < ttl) {
      // Revalidación silenciosa; la respuesta cacheada es inmediata.
      nativeFetch(request, { ...init, cache: 'no-cache' }).then(async response => {
        if (!response.ok) return;
        const body = await response.clone().arrayBuffer();
        await window.INCA_DB?.set('datasets', key, {
          timestamp: Date.now(), status: response.status,
          headers: [...response.headers.entries()], body
        });
      }).catch(() => {});
      return new Response(cached.body.slice(0), { status: cached.status, headers: cached.headers });
    }

    try {
      const response = await nativeFetch(request, init);
      if (response.ok) {
        const body = await response.clone().arrayBuffer();
        window.INCA_DB?.set('datasets', key, {
          timestamp: Date.now(), status: response.status,
          headers: [...response.headers.entries()], body
        }).catch(() => {});
      }
      return response;
    } catch (error) {
      if (cached) return new Response(cached.body.slice(0), { status: cached.status, headers: cached.headers });
      throw error;
    }
  };
})();
