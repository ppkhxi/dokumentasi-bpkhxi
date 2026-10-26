# dkpoint — Dokumentasi Foto Lapangan BPKH Wilayah XI

Aplikasi kamera lapangan (PWA) untuk dokumentasi berwatermark: logo, nama kantor, koordinat GPS, dan waktu dibakar ke foto. Foto bisa diunggah ke cloud, dibagikan ke WhatsApp atau Drive, dan direkap dalam tabel.

## Struktur

- `www/` — aplikasi web (PWA): `index.html`, `sw.js`, `manifest.webmanifest`, `peta.js`, `js/`, `icons/`
- `functions/api/` — Cloudflare Pages Functions: `telemetri.js`, `admin.js`
- `db/schema.sql` — skema database D1 (binding `DB`)

## Deploy

Hosting di Cloudflare Pages. Folder output: `www`. Panel admin memakai secret `TOKEN_ADMIN` yang diatur di dashboard Pages, bukan di kode.
