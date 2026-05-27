// ═══════════════════════════════════════════════════════════
//  MWire Service Worker
//
//  Estrategia mixta:
//    · index.html  → Network-first: siempre intenta la red para
//                    tener la versión más reciente. Si no hay
//                    conexión, sirve desde caché.
//    · Resto       → Cache-first: iconos y manifest van rápido
//                    desde caché; si no están, los descarga.
//
//  Para actualizar la app:
//    Solo sube los archivos nuevos al servidor.
//    El móvil los detecta en la próxima apertura y muestra
//    el aviso "Nueva versión disponible".
//    NO hace falta cambiar ningún número de versión.
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'mwire-v1';

// Assets estáticos que rara vez cambian → cache-first
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ── INSTALL: precachear assets estáticos ───────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar cachés antiguas + avisar al cliente ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Avisar a todas las pestañas abiertas que hay nueva versión
        self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
        });
      })
  );
});

// ── FETCH: estrategia según tipo de recurso ────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = event.request.mode === 'navigate';
  const isHTML = url.pathname.endsWith('.html') || url.pathname === '/';

  if (isNavigation || isHTML) {
    // ── Network-first para HTML ──────────────────────────
    // Siempre intenta descargar la versión más reciente.
    // Si no hay red, sirve lo que haya en caché.
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            // Guardar la versión fresca en caché para uso offline
            const toCache = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
          }
          return response;
        })
        .catch(() => caches.match(event.request)
          .then(cached => cached || caches.match('/index.html'))
        )
    );
  } else {
    // ── Cache-first para assets estáticos ───────────────
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const toCache = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
          }
          return response;
        });
      })
    );
  }
});
