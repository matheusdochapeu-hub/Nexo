/* Nexo · service worker
 * Escopo: /nexo/ — nunca interfere nos outros quatro apps.
 * HTML: network-first (versão nova na hora). Estáticos: cache-first.
 */

const CACHE_NAME = 'nexo-v0.15.1';
const ESTATICOS = [
  './',
  './index.html',
  './css/nexo.css',
  './js/config.js',
  './js/core.js',
  './js/faturas.js',
  './js/ajustes.js',
  './js/sync.js',
  './js/instalar.js',
  './js/atendimentos.js',
  './js/search.js',
  './js/store.js',
  './js/app.js',
  './shared/faturas-base.js',
  './manifest.json',
  './icons/nexo.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ESTATICOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const ehNavegacao = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (ehNavegacao) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copia));
          return resp;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cacheado) =>
        cacheado ||
        fetch(req).then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copia));
          return resp;
        })
    )
  );
});
