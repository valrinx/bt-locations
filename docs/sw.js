const CACHE_NAME = 'bt-locations-v7.2.8';
// Only truly static assets (libs, icons) — NOT app code
const STATIC_ASSETS = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
  'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600&display=swap'
];
// App code files — always network-first (never serve stale)
const APP_FILES = ['index.html', 'app.js', 'locations.js'];

// Install: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for API/data, cache-first for static assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET
  if (event.request.method !== 'GET') return;

  // Map tiles: cache with network fallback (stale-while-revalidate)
  if (url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('server.arcgisonline.com') ||
    url.hostname.includes('basemaps.cartocdn.com') ||
    url.hostname.includes('mt1.google.com')) {
    event.respondWith(
      caches.open('bt-tiles-v1').then(cache =>
        cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request).then(res => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // GitHub API / raw.githubusercontent: network only
  if (url.hostname.includes('api.github.com') ||
    url.hostname.includes('raw.githubusercontent.com')) {
    return;
  }

  // all_locations.json: network-first
  if (url.pathname.endsWith('all_locations.json')) {
    event.respondWith(
      fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // App code (index.html, app.js, locations.js): NETWORK-FIRST
  // This is critical — ensures Android Chrome always gets latest code
  const isAppFile = APP_FILES.some(f => url.pathname.endsWith(f)) || event.request.mode === 'navigate';
  if (isAppFile) {
    event.respondWith(
      fetch(event.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => {
        return caches.match(event.request, { ignoreSearch: true }).then(cached => {
          return cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : new Response('Offline', { status: 503 }));
        });
      })
    );
    return;
  }



  // Static assets (libs, icons): cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      });
    }).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
      return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    })
  );
});
