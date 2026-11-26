const CACHE_NAME = 'Kurz-v1.1.0';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png'
];

// Instalace — uložení všech základních offline souborů do cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          CORE_ASSETS.map((url) =>
            cache.add(url).catch((err) => console.warn('Kurz SW: Nepodařilo se kešovat:', url, err))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

// Aktivace — smazání starých verzí cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => (name !== CACHE_NAME ? caches.delete(name) : null))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Podpora okamžité aktivace po kliknutí na "Zkontrolovat aktualizaci"
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Zachytávání požadavků: Network-First pro HTML, Cache-First pro statické soubory
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Hlavní dokument: Network-First s offline fallbackem
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || caches.match('./')))
    );
    return;
  }

  // Ikony, manifest a ostatní lokální zdroje: Cache-First
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          console.warn('Kurz SW: Zdroj není dostupný offline:', req.url);
        });
    })
  );
});
