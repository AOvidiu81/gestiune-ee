// admin/sw.js — service worker separat pentru panoul de admin, ca sa poata
// fi instalat ca aplicatie (PWA) la fel ca aplicatia soferilor. Admin-ul are
// oricum nevoie de internet ca sa functioneze (se conecteaza mereu la
// Supabase), asa ca acest service worker cachuie doar "coaja" aplicatiei
// (HTML/CSS/JS/imagini) pentru o incarcare rapida — NU ofera functionare
// offline pentru datele de administrare.

const CACHE_VERSION = 'pv-euro-ecologic-admin-v15';
const APP_SHELL = [
  './',
  'index.html',
  'admin.css',
  'admin.js',
  'manifest.json',
  '../assets/logo/euro_ecologic_logo.png',
  '../assets/logo/euro_ecologic_mark.png',
  '../icons/admin-icon-192.png',
  '../icons/admin-icon-512.png',
  '../icons/admin-maskable-192.png',
  '../icons/admin-maskable-512.png',
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
  // Niciodata nu cachuim cereri catre Supabase (date live de administrare).
  if (event.request.url.includes('supabase.co')) return;
  // NETWORK-FIRST (nu cache-first): admin-ul are oricum nevoie de internet
  // ca sa functioneze, asa ca preferam mereu ultima versiune de pe server.
  // Cache-ul e doar o plasa de siguranta pentru cazul rar cand chiar nu e
  // semnal deloc. (Am avut o problema reala cu cache-first: butoane noi
  // aparute intr-un update nu functionau pana la un refresh fortat, pentru
  // ca pagina veche cachuita ramanea servita la nesfarsit.)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
