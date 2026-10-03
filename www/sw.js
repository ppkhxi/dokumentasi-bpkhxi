/* Service worker Portal Dokumentasi dkpoint
   Strategi: cache-first untuk berkas aplikasi, dengan pembaruan di latar
   belakang. Foto TIDAK disimpan di sini — foto ada di IndexedDB. */

const VERSI = 'dkpoint-v3.9.11';
const CACHE_TILES = 'dkpoint-tiles-v1';
const BERKAS = [
  './',
  './index.html',
  './admin.html',
  './peta.js',
  './js/security.js',
  './js/exif-gps.js',
  './js/leaflet.js',
  './js/leaflet.css',
  './js/megajs.umd.js',
  './js/mega-engine.js',
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
      .then(k => Promise.all(k.filter(n => n !== VERSI && n !== CACHE_TILES).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Tile Peta & CDN Eksternal: Cache-First agar peta tetap tampil saat offline di hutan/lapangan
  const isTile = (url.hostname.includes('google.com') && url.pathname.includes('/vt')) ||
                 url.hostname.includes('openstreetmap.org') ||
                 url.hostname.includes('arcgisonline.com');
  const isCdn = url.hostname.includes('unpkg.com') || url.hostname.includes('cdnjs.cloudflare.com');

  if (isTile || isCdn) {
    e.respondWith(
      caches.open(CACHE_TILES).then(cache => {
        return cache.match(req).then(cached => {
          if (cached) return cached;
          return fetch(req).then(networkRes => {
            if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaque')) {
              cache.put(req, networkRes.clone());
            }
            return networkRes;
          }).catch(() => cached);
        });
      })
    );
    return;
  }

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
