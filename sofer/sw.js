// sw.js — „Șofer EE”. Pastreaza in memoria telefonului fisierele proprii si
// modulele refolosite din ../pv/, ca aplicatia sa porneasca si fara semnal.
// La ORICE modificare in /sofer/ SAU in /pv/ (js, css, imagini) creste VERSIUNE,
// altfel telefoanele raman pe codul vechi.
// Aplicatia de rute din fila „Rută” are propriul service worker (../ruta/sw.js).

const VERSIUNE = 'sofer-ee-s11';
const PV = [
  'css/styles.css', 'css/print.css',
  'js/db.js', 'js/utils.js', 'js/router.js', 'js/components.js', 'js/catalog-defaults.js',
  'js/pv-numbering.js', 'js/photo-annotate.js', 'js/pdf-print.js', 'js/pdf-generate.js',
  'js/pdf-cereri.js', 'js/whatsapp-import.js', 'js/auth.js', 'js/vcard.js',
  'js/screens-login.js', 'js/screens-setup.js', 'js/screens-home.js', 'js/screens-pv-form.js',
  'js/screens-history.js', 'js/screens-cereri.js', 'js/screens-comenzi.js',
  'assets/logo/euro_ecologic_logo.png', 'assets/logo/euro_ecologic_mark.png',
  'assets/docs/header.png', 'assets/docs/footer.png', 'assets/docs/stampila_euro_ecologic.png',
].map((f) => '../pv/' + f);
const SCHELET = ['./', 'index.html', 'manifest.json', 'sofer.js', 'sofer.css', 'icons/icon-192.png', 'icons/icon-512.png', ...PV];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSIUNE).then((c) => c.addAll(SCHELET)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chei) => Promise.all(chei.filter((k) => k.startsWith('sofer-ee-') && k !== VERSIUNE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('.supabase.co')) return; // datele vin mereu proaspete
  e.respondWith(
    caches.open(VERSIUNE).then((cache) =>
      cache.match(req, { ignoreSearch: req.mode === 'navigate' }).then((dinMemorie) => {
        if (dinMemorie) return dinMemorie;
        return fetch(req)
          .then((r) => {
            // 'basic' = fisierele proprii; 'cors' = supabase-js de pe esm.sh
            if (r.ok && (r.type === 'basic' || r.type === 'cors')) cache.put(req, r.clone());
            return r;
          })
          .catch(() => dinMemorie);
      })
    )
  );
});
