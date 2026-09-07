// Naukri Update — Service Worker (Phase 1)
// Basic caching for PWA installability.
// Phase 2: add push notification support for OTP alerts.

const CACHE_NAME = 'naukri-update-v1';
const STATIC_ASSETS = ['/', '/dashboard', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Always use network for API routes (agent proxy, Supabase)
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  // Cache-first for static assets
  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => cached ?? fetch(event.request))
  );
});
