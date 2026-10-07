// sw.js — GestiuneEE. Ține aplicația instalabilă și o pornește repede,
// dar NU păstrează niciodată în memorie datele din Supabase: acelea trebuie
// să fie mereu proaspete.
const VERSIUNE = 'gestiune-ee-v4.75';
const SCHELET = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSIUNE)
      .then((c) => Promise.allSettled(SCHELET.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chei) => Promise.all(chei.filter((k) => k !== VERSIUNE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Datele din Supabase trec mereu direct la server, niciodată din memorie.
  if (url.hostname.endsWith('.supabase.co')) return;

  // Pagina: întâi de la server (ca să prindă versiunea nouă), altfel din memorie.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req.url, { cache: 'no-store' })
        .then((r) => {
          const copie = r.clone();
          caches.open(VERSIUNE).then((c) => c.put(req, copie)).catch(() => {});
          return r;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Fișierele proprii (iconițe, manifest): întâi de la server, ca instalarea să ia
  // mereu iconița nouă; din memorie doar fără semnal.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req.url, { cache: 'no-store' })
        .then((r) => {
          if (r && r.status === 200) {
            const copie = r.clone();
            caches.open(VERSIUNE).then((c) => c.put(req, copie)).catch(() => {});
          }
          return r;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Bibliotecile de pe CDN: întâi din memorie, apoi de la server.
  e.respondWith(
    caches.match(req).then((din_memorie) => {
      if (din_memorie) return din_memorie;
      return fetch(req).then((r) => {
        if (r && r.status === 200 && (r.type === 'basic' || r.type === 'cors')) {
          const copie = r.clone();
          caches.open(VERSIUNE).then((c) => c.put(req, copie)).catch(() => {});
        }
        return r;
      });
    })
  );
});
