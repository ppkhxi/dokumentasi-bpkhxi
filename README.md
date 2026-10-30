# dkpoint — Dokumentasi Foto Lapangan BPKH Wilayah XI

Aplikasi kamera lapangan (PWA) dan APK Android untuk dokumentasi berwatermark: logo, nama kantor, koordinat GPS, dan waktu dibakar ke foto. Foto bisa diunggah ke cloud, dibagikan ke WhatsApp atau Drive, dan direkap dalam tabel.

## Struktur

- `www/` — aplikasi web (PWA): `index.html`, `sw.js`, `manifest.webmanifest`, `peta.js`, `js/`, `icons/`
- `functions/api/` — Cloudflare Pages Functions: `telemetri.js`, `admin.js`
- `db/schema.sql` — skema database D1 (binding `DB`)
- `android/` — proyek APK Android (dibangun otomatis lewat `.github/workflows/android.yml`)
- `pusat-kendali/` — halaman pemantau akun pendukung (GitHub, Supabase, Cloudflare, penyimpanan) per proyek; lihat `pusat-kendali/README.md`

## Deploy

- Web: Cloudflare Pages, folder output `www`, branch produksi `main`.
- APK: GitHub Actions membangun APK dan menyimpannya di `www/dl/dkpoint.apk`.
- Secret `TOKEN_ADMIN` diatur di dashboard Pages, bukan di kode.
