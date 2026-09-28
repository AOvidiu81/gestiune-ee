// sw.js — service worker minimal: cache "app shell" pentru functionare
// offline completa dupa prima incarcare. La fiecare modificare a
// aplicatiei, creste CACHE_VERSION ca telefoanele sa preia noua versiune.

const CACHE_VERSION = 'pv-euro-ecologic-v60';
const APP_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'css/print.css',
  'js/app.js',
  'js/db.js',
  'js/utils.js',
  'js/router.js',
  'js/components.js',
  'js/catalog-defaults.js',
  'js/pv-numbering.js',
  'js/photo-annotate.js',
  'js/pdf-print.js',
  'js/pdf-generate.js',
  'js/pdf-cereri.js',
  'js/whatsapp-import.js',
  'js/auth.js',
  'js/vcard.js',
  'js/screens-login.js',
  'js/screens-setup.js',
  'js/screens-home.js',
  'js/screens-pv-form.js',
  'js/screens-history.js',
  'js/screens-cereri.js',
  'assets/logo/euro_ecologic_logo.png',
  'assets/logo/euro_ecologic_mark.png',
  'assets/docs/header.png',
  'assets/docs/footer.png',
  'assets/docs/stampila_euro_ecologic.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // 'basic' = fisierele proprii; 'cors' = libraria supabase-js
          // incarcata de pe esm.sh (js/auth.js) — o cachuim si pe aceasta
          // dupa prima incarcare reusita, ca autentificarea/sincronizarea
          // sa nu depinda strict de cache-ul HTTP nativ al telefonului.
          if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
