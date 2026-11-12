const CACHE = 'dm-app-v15';
const CORE = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/css/app.css',
  '/css/vision.css',
  '/css/tutorials.css',
  '/css/reforma.css',
  '/css/legal.css',
  '/fonts/fonts.css',
  '/js/app.js',
  '/js/voz.js',
  '/js/micro-permiso.js',
  '/js/obd.js',
  '/js/tutorials.js',
  '/js/lighting.js',
  '/js/tyres.js',
  '/js/buying.js',
  '/js/consent.js',
  '/js/forum.js',
  '/js/garage.js',
  '/js/scan.js',
  '/js/testigos.js',
  '/js/hero3d.js',
  '/img/app/icon-192.png',
  '/img/app/icon-512.png',
  '/img/app/icon-maskable-512.png',
  '/img/app/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match('/offline.html').then(hit => hit || caches.match('/')))
    );
    return;
  }

  if (url.pathname.startsWith('/css/') || url.pathname.startsWith('/js/') || url.pathname.startsWith('/img/') || url.pathname.startsWith('/fonts/') || url.pathname === '/favicon.svg') {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => caches.match('/offline.html')))
    );
  }
});
