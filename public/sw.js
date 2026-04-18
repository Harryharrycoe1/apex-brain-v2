// APEX BRAIN Service Worker — minimal shell cache for PWA install
// V5.0: cache version bumped to force browsers to drop stale V4.x shell.
const CACHE = 'apex-v5-0';
const ASSETS = ['/', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Network-first strategy — never cache API responses, always get fresh data
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache API routes — always fetch fresh
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  // For app shell, try network first, fall back to cache
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
