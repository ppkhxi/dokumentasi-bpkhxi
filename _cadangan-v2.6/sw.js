/* Service worker Portal Dokumentasi BPKH Wilayah XI
   Strategi: cache-first untuk berkas aplikasi, dengan pembaruan di latar
   belakang. Foto TIDAK disimpan di sini — foto ada di IndexedDB. */

const VERSI = 'bpkh-dok-v2.6.0';
const BERKAS = [
  './',
  './index.html',
  './admin.html',
  './peta.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-96.png',
  './icons/logo-kemenhut.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSI)
      .then(c => c.addAll(BERKAS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(n => n !== VERSI).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Navigasi: coba jaringan dulu supaya versi baru cepat terpakai,
  // jatuh ke cache kalau sedang offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const salinan = res.clone();
          caches.open(VERSI).then(c => c.put('./index.html', salinan));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Aset lain: cache dulu, perbarui diam-diam di latar belakang.
  e.respondWith(
    caches.match(req).then(tersimpan => {
      const jaringan = fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const salinan = res.clone();
            caches.open(VERSI).then(c => c.put(req, salinan));
          }
          return res;
        })
        .catch(() => tersimpan);
      return tersimpan || jaringan;
    })
  );
});
