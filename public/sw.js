/// <reference lib="webworker" />
/**
 * Service worker for Campaign Builder.
 *
 * Strategy:
 * - Navigations: network-first, fall back to cached index.html when offline.
 * - Static assets (hashed bundles, fonts, tiles): cache-first, network fallback.
 *   Hashed filenames are immutable, so a cached copy stays valid forever.
 * - No precache list: the build injects content hashes into filenames, so
 *   the set of assets is only known after the build. Runtime caching handles
 *   this automatically.
 *
 * The worker skips waiting and cleans up old caches on activate, so a new
 * deploy takes effect on the next visit.
 */

/// @type {Cache}
let shellCache;

const CACHE_NAME = 'campaign-builder-v1';

self.addEventListener('install', (event) => {
  // Skip waiting so the new worker activates immediately.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old caches.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      // Take control of all open pages immediately.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, cache fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          // Cache the fresh response for next time.
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
          return response;
        } catch {
          // Offline: serve the cached shell.
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(request);
          if (cached) return cached;
          // Last resort: cached index.html.
          return cache.match('./index.html');
        }
      })(),
    );
    return;
  }

  // Static assets: cache-first, network fallback.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        // Only cache successful responses.
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        // Offline and not in cache: let the browser show its error.
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })(),
  );
});
