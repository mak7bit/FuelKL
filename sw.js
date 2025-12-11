const CACHE_NAME = 'fuelkl-shell-v1';
const ASSETS = [
  'index.html',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'prices.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // network-first for prices.json (works even when served under /your-repo/)
  if (url.pathname.endsWith('/prices.json') || url.pathname === 'prices.json' || url.pathname.endsWith('prices.json')) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
