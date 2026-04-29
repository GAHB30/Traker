// Bumpeamos la versión para forzar la activación del nuevo SW y limpiar caché viejo
const CACHE_NAME = 'gs-tracker-v2';

// Solo cacheamos assets estáticos que casi nunca cambian (iconos, fuentes)
// El HTML NO se mete aquí — siempre va por network-first
const STATIC_ASSETS = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  // Forzamos al nuevo SW a activarse inmediatamente sin esperar a que se cierren las pestañas viejas
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // BYPASS TOTAL para llamadas que NUNCA deben cachearse:
  // - Supabase (datos del usuario)
  // - APIs / proxies (IA de macros y kcal)
  if (
    url.hostname.endsWith('supabase.co') ||
    url.pathname.includes('/api/') ||
    url.hostname.includes('netlify.app')
  ) {
    return; // dejamos que el navegador haga la request normal sin tocarla
  }

  // Solo manejamos GET requests — POST/PATCH no se cachean
  if (event.request.method !== 'GET') return;

  // NETWORK-FIRST para el HTML principal (index.html y root '/')
  // Esto garantiza que siempre obtienes la última versión cuando hay red.
  // Solo cae al caché como fallback offline.
  const isHTML =
    event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html');

  if (isHTML) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Guardamos copia para uso offline
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // CACHE-FIRST para assets estáticos (iconos, fuentes, CSS, JS externo)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
