const CACHE_NAME = 'medicare-public-v3';
const PUBLIC_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icon.svg',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copiedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copiedResponse)).catch(() => {});
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(event.request) || await caches.match('/offline.html');
          return cachedPage || Response.error();
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copiedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copiedResponse)).catch(() => {});
        }
        return response;
      }).catch(() => caches.match('/offline.html') || Response.error());
    })
  );
});
