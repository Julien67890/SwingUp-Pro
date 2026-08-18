/* =========================================================
   SwingUp Pro — Service Worker de la coquille (shell)
   Ne met en cache QUE les fichiers de la coquille (index.html,
   manifest, icônes). Le Télémètre et la Carte de score ont
   chacun leur propre Service Worker (telemetre/sw.js et
   score/sw.js) qui gère leur propre cache offline, avec un
   scope plus précis qui prend naturellement le dessus sur
   celui-ci pour tout ce qui se passe dans /telemetre/ et /score/.
   Incrémenter CACHE_VERSION à chaque mise en ligne.
   ========================================================= */
const CACHE_VERSION = 'swinguppro-shell-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './icons/icon-32.png',
  './icons/icon-48.png',
  './icons/icon-64.png',
  './icons/icon-120.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-256.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg'
];

const RUNTIME_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW shell] Pré-cache partiel :', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  /* Ne jamais intervenir sur les sous-applications : chacune a son propre SW,
     ceci n'est qu'un filet de sécurité si un navigateur route malgré tout
     une requête /telemetre/ ou /score/ vers ce Service Worker racine. */
  if (url.pathname.indexOf('/telemetre/') !== -1 || url.pathname.indexOf('/score/') !== -1) return;

  if (url.origin !== self.location.origin && !RUNTIME_HOSTS.includes(url.hostname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (RUNTIME_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        return res;
      }).catch(() => hit))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
