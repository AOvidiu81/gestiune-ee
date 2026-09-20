// sw.js — Ruta EuroEcologic. Face aplicația instalabilă și o pornește
// repede. Datele din Supabase nu se păstrează niciodată în memorie.
const VERSIUNE = 'ruta-ee-v1';
const SCHELET = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSIUNE)
      .then((c) => Promise.allSettled(SCHELET.map((u) => c.add(u))))
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
  if (url.hostname.endsWith('.supabase.co')) return;

  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copie = r.clone();
          caches.open(VERSIUNE).then((c) => c.put(req, copie)).catch(() => {});
          return r;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

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
