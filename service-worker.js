// Service Worker pro aplikaci Kurz (v2.0.2)
// Odděluje cache aplikace, cache knihoven Firebase SDK a přímý síťový provoz pro Auth/Firestore.

const CACHE_NAME = 'kurz-app-v2.0.2';
const FIREBASE_SDK_CACHE = 'kurz-firebase-sdk-v10.12.2';

// Soubory aplikace (při instalaci se uloží ty, které na serveru reálně existují)
const APP_SHELL_CANDIDATES = [
  './',
  './index.html',
  './kurz_v2_0_1.html',
  './manifest.json',
  './icon-192x192.png'
];

// Moduly Firebase SDK používané v aplikaci Kurz
const FIREBASE_SDK_URLS = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
];

// Domény, které Service Worker nesmí cachovat ani blokovat
const BYPASS_HOST_PATTERNS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebase.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'accounts.google.com',
  'apis.google.com',
  '.firebaseio.com',
  '.firebaseapp.com'
];

// Instalace Service Workeru a přednačtení základních souborů a Firebase SDK
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const appCache = await caches.open(CACHE_NAME);
      await Promise.allSettled(
        APP_SHELL_CANDIDATES.map((url) => appCache.add(url))
      );

      const sdkCache = await caches.open(FIREBASE_SDK_CACHE);
      await Promise.allSettled(
        FIREBASE_SDK_URLS.map((url) => sdkCache.add(url))
      );

      await self.skipWaiting();
    } catch (err) {
      console.warn('Kurz SW: Chyba při instalaci cache:', err);
    }
  })());
});

// Aktivace nové verze a úklid starých cache
self.addEventListener('activate', (event) => {
  const validCaches = new Set([CACHE_NAME, FIREBASE_SDK_CACHE]);
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !validCaches.has(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    } catch (err) {
      console.warn('Kurz SW: Chyba při aktivaci:', err);
    }
  })());
});

// Zachytávání GET požadavků
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // POST/PUT/DELETE požadavky (Firestore zápisy, Auth) jdou přímo na síť
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Nikdy nezachytávat OAuth přesměrování Firebase Auth
  if (url.pathname.startsWith('/__/auth') || url.pathname.startsWith('/__/firebase')) {
    return;
  }

  // 2. Nikdy nezachytávat živé API volání Google / Firebase
  if (BYPASS_HOST_PATTERNS.some((host) => url.hostname === host || url.hostname.endsWith(host))) {
    return;
  }

  // 3. Firebase SDK z gstatic.com -> Cache-First (včetně navazujících sub-modulů)
  if (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith((async () => {
      const cache = await caches.open(FIREBASE_SDK_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;

      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })());
    return;
  }

  // 4. Vlastní soubory aplikace (stejný původ) -> Network-First s offline zálohou
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;

        if (request.mode === 'navigate') {
          return (
            (await cache.match('./')) ||
            (await cache.match('./index.html')) ||
            (await cache.match('./kurz_v2_0_2.html'))
          );
        }
        throw err;
      }
    })());
  }
});

// Okamžitá aktivace čekající verze při kliknutí na „Zkontrolovat aktualizaci“
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});