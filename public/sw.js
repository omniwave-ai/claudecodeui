// Service Worker for Claude Code UI PWA
// Version is updated on each build to invalidate old caches
const CACHE_VERSION = '2';
const CACHE_NAME = `claude-ui-v${CACHE_VERSION}`;

// Assets to pre-cache (static files only, not HTML)
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.svg',
  '/favicon.png'
];

// Install event - pre-cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()) // Immediately activate new SW
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('claude-ui-') && name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim()) // Take control of all clients immediately
  );
});

// Fetch event - different strategies for different content types
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Network-first for HTML pages (always get fresh content)
  if (event.request.mode === 'navigate' ||
      event.request.destination === 'document' ||
      url.pathname === '/' ||
      url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone and cache the response
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache only if network fails
          return caches.match(event.request);
        })
    );
    return;
  }

  // Cache-first for hashed assets (immutable - filename changes when content changes)
  if (url.pathname.startsWith('/assets/') && url.pathname.match(/-[a-zA-Z0-9]{8}\./)) {
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) {
            return cached;
          }
          return fetch(event.request).then(response => {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
            return response;
          });
        })
    );
    return;
  }

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Stale-while-revalidate for other static files
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        const fetchPromise = fetch(event.request)
          .then(response => {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
            return response;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
  );
});

// Listen for skip waiting message from clients
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});