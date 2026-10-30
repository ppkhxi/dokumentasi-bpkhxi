# Pusat Kendali Platform

Satu halaman untuk memantau semua akun pendukung aplikasi dan web, per proyek (Looks Studios, dkpoint, Identifikasi TNKPS). Setiap proyek punya empat bagian:

- **A · GitHub**: proses GitHub Actions terakhir, durasi, hasil
- **B · Supabase**: proyek, status, region, versi Postgres
- **C · Cloudflare**: proyek Pages dan database D1
- **D · Penyimpanan**: bucket R2 dan tautan cloud lain (Google Drive, MEGA, Synology)

Halaman ini dirancang untuk dibuka di Chrome bersama **Claude in Chrome**: semua status ditulis sebagai teks dan setiap bagian punya judul yang jelas, jadi Claude bisa membacanya lalu membuka konsol yang tepat atas perintah Anda.

## Struktur

- `public/`: halaman (`index.html`, `app.js`, `style.css`, `_headers`)
- `functions/api/proyek/`: API `GET /api/proyek` dan `GET /api/proyek/:id` (Cloudflare Pages Functions)
- `functions/_lib/proyek.js`: **daftar proyek dan sumber dayanya**, yang diubah saat menambah proyek atau repo
- `functions/_lib/sumber.js`: pengambil data dari API GitHub, Supabase, dan Cloudflare
- `functions/_lib/akses.js` + `functions/api/_middleware.js`: verifikasi Cloudflare Access

## Pasang di Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git**, pilih repo ini.
   - Root directory: `pusat-kendali`
   - Build command: kosong
   - Build output directory: `public`
2. **Lindungi dengan Cloudflare Access** (Zero Trust → Access → Applications → Self-hosted), domain = domain Pages proyek ini, kebijakan: izinkan email Anda saja. Catat **Application Audience (AUD) Tag**.
3. **Settings → Variables and Secrets** (Production), isi:

| Nama | Isi |
|---|---|
| `ACCESS_TEAM_DOMAIN` | `https://<nama-tim>.cloudflareaccess.com` |
| `ACCESS_AUD` | AUD Tag dari langkah 2 |
| `GITHUB_TOKEN_<PROYEK>` | Fine-grained token GitHub, izin baca *Actions* dan *Metadata* untuk repo proyek |
| `SUPABASE_TOKEN_<PROYEK>` | Access token Supabase (Account → Access Tokens) |
| `CF_ACCOUNT_<PROYEK>` | Account ID Cloudflare proyek |
| `CF_TOKEN_<PROYEK>` | API token Cloudflare dengan izin baca *Pages*, *D1*, *Workers R2 Storage* |

`<PROYEK>` = `LOOKS`, `DKPOINT`, atau `TNKPS`, sesuai nama di `proyek.js`. Kalau semua proyek ada di akun induk yang sama, isi token yang sama di setiap nama.

Tanpa `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`, API menolak semua permintaan (401). Semua token cukup **izin baca**: tombol di halaman hanya membuka konsol asli; tindakan dilakukan di sana.

## Menambah proyek atau repo

Ubah `functions/_lib/proyek.js`, commit, lalu Pages akan deploy ulang otomatis. Bagian yang bernilai `null` tampil sebagai "tidak dipakai"; bagian yang tokennya belum diisi tampil sebagai "menunggu akses".

## Memakai bersama Claude in Chrome

Buka halaman ini di profil Chrome khusus kerja, aktifkan Claude in Chrome di panel samping, lalu beri perintah, misalnya:

- "Proyek mana yang perlu dicek?"
- "Buka proyek Supabase yang dijeda dan aktifkan lagi"
- "Kenapa build APK terakhir dkpoint dibatalkan?"

Untuk tindakan yang mengubah sesuatu (mengaktifkan atau menghapus proyek, deploy, mengubah secret), periksa dulu sebelum menyetujui.

## Uji lokal

```
cd pusat-kendali
npx wrangler pages dev public --binding IZINKAN_TANPA_ACCESS=1
```

`IZINKAN_TANPA_ACCESS=1` hanya untuk uji lokal, jangan pernah diisi di Cloudflare.
