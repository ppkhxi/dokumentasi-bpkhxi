# Portal Dokumentasi Foto Lapangan — BPKH Wilayah XI

Aplikasi pencatatan foto lapangan berwatermark: foto diambil langsung dari kamera, otomatis
diberi logo + nama kantor + koordinat GPS + waktu, dikompres, lalu diunggah ke Google Drive
kantor dan direkap dalam tabel yang bisa diunduh sebagai PDF/DOCX.

---

## Alamat yang sudah aktif

| Bagian | Alamat |
|---|---|
| Aplikasi petugas | <https://dokumentasi-bpkhxi.netlify.app> |
| Panel admin | <https://dokumentasi-bpkhxi.netlify.app/admin.html> |
| Backend | `https://script.google.com/macros/s/AKfycbzkmJ7szsLb8nO9VzdMNic4DfF0worK56hzN8N5pv8qIHvGdxq8IsGcwUz0-PqlIX3ZHg/exec` |
| Drive master | folder `DOKUMENTASI` (`1c9p-VDSYLzAPeZgcSI99negl2PiEmP72`) |
| Hosting | Netlify, proyek `dokumentasi-bpkhxi`, akun `ppkhxi@gmail.com` |
| Apps Script | proyek `dokumentasi-bpkhxi`, akun `ppkhxi@gmail.com` |

**Token admin** tersimpan di `backend/Code.gs` baris `TOKEN_ADMIN` — dipakai untuk masuk panel admin.

Terpasang dan teruji ujung ke ujung pada 16 Agustus 2026: foto dari kamera HP masuk ke
subfolder Drive lengkap dengan watermark, koordinat, dan catatan.

### Kalau aplikasi diperbarui

Seret folder `www` ke bagian **Production deploys** di halaman proyek Netlify —
**bukan** ke halaman `app.netlify.com/drop`, karena halaman itu selalu membuat situs baru.

### Kalau `Code.gs` diubah

Menyimpan saja tidak cukup: **Deploy → Manage deployments → ✏ → Version: New version → Deploy**.
Alamat `/exec` tidak berubah.

---

## Mulai dari mana

| Kalau Anda ingin… | Buka berkas |
|---|---|
| **Pegangan admin: semua alamat, kunci, dan prosedur** | **[RANGKUMAN.md](RANGKUMAN.md)** |
| Melihat aplikasinya sekarang di komputer | klik dua kali `jalankan-server.bat` |
| Memasang di HP Android | [BUILD_APK.md](BUILD_APK.md) |
| Mengaktifkan upload sungguhan ke Drive | [backend/PENGATURAN_BACKEND.md](backend/PENGATURAN_BACKEND.md) |
| Memahami isi tiap layar & batasannya | [CARA_MENJALANKAN.md](CARA_MENJALANKAN.md) |

**Urutan yang disarankan:** pasang aplikasinya di HP dulu (BUILD_APK.md Cara 1), coba ambil
foto sungguhan untuk memastikan watermark dan GPS-nya benar, baru pasang backend.

---

## Susunan berkas

```
D:\DOKUMENTASI APP\
├── www\                        aplikasinya — folder INI yang diunggah ke hosting
│   ├── index.html                aplikasi petugas (PWA satu halaman)
│   ├── admin.html                panel admin: buat room, link undangan, rekap
│   ├── manifest.webmanifest      identitas aplikasi (nama, ikon, warna)
│   ├── sw.js                     service worker — aplikasi jalan tanpa sinyal
│   └── icons\                    ikon aplikasi + splash screen
├── backend\
│   ├── Code.gs                   backend Google Apps Script
│   └── PENGATURAN_BACKEND.md     cara memasangnya, langkah demi langkah
├── package.json                capacitor — untuk membangun APK
├── capacitor.config.json       nama & ID aplikasi Android
├── jalankan-server.bat         uji cepat di komputer / HP satu WiFi
├── BUILD_APK.md                cara memasang di Android (2 cara)
└── CARA_MENJALANKAN.md         penjelasan isi aplikasi
```

---

## Cara kerjanya

```
HP Petugas                          Backend (Apps Script)         Google Drive
┌──────────────────┐                ┌────────────────────┐        ┌──────────────┐
│ Kamera           │                │                    │        │ DOKUMENTASI  │
│  ↓ watermark     │   foto+data    │ periksa token room │  file  │  ├ PPTPKH… │
│  ↓ kompres       │ ─────────────► │ simpan ke folder   │ ─────► │  └ PPTPKH… │
│  ↓ antrian lokal │                │ catat ke spreadsheet│        │ Rekap.xlsx  │
│ Galeri & Tabel   │                └────────────────────┘        └──────────────┘
└──────────────────┘
   tanpa sinyal → foto menunggu di HP, terkirim sendiri begitu online
```

**Kunci keamanannya:** HP petugas tidak pernah memegang kredensial Google. Yang dipegang hanya
*token room* dari link undangan. Backend berjalan di akun pemilik Drive, jadi hak tulis ke Drive
tidak pernah keluar dari akun itu. Kalau sebuah link bocor, admin cukup menekan **Ganti Link**.

---

## Peran

**Admin** (lewat `admin.html` di komputer)
membuat room → subfolder Drive terbentuk otomatis → salin link undangan → kirim ke petugas.
Bisa menonaktifkan room, mengganti link kalau bocor, melihat rekap seluruh room, dan mengunduh CSV.

**Petugas** (lewat aplikasi di HP)
buka link undangan sekali → isi nama → pilih room → ambil foto → isi catatan → simpan.
Sisanya berjalan sendiri.

---

## Status pekerjaan

**Sudah selesai dan teruji**

- Aplikasi petugas: kamera, watermark dibakar ke piksel, kompresi otomatis, antrian offline
  (IndexedDB), galeri, tabel rekap, unduh PDF/DOCX/JPG/JSON
- PWA: bisa dipasang ke layar utama, jalan penuh layar, tetap terbuka tanpa sinyal
- Backend Apps Script: upload ke subfolder Drive per room, pencatatan ke spreadsheet,
  penolakan token palsu, penjagaan foto kembar, penguncian saat banyak pengiriman bersamaan
- Panel admin: buat room, link undangan, aktif/nonaktif, ganti link, rekap, unduh CSV
- Link undangan: sekali buka di HP, room tersimpan di perangkat
- Jalur gagal: foto yang gagal terkirim tetap aman dan dikirim ulang otomatis, termasuk saat
  aplikasi dibuka kembali dari latar belakang
- Penjagaan data: permintaan penyimpanan awet ke Android, peringatan saat memori penuh,
  penjaga tekan-ganda tombol Simpan, dan opsi hapus otomatis setelah terkirim

**Belum ada (dan alasannya)**

| Belum ada | Keterangan |
|---|---|
| Logo resmi BPKH XI | Masih kotak "LOGO" di watermark. Ganti lewat **Setelan → Watermark** di tiap HP begitu berkasnya ada. |
| Login akun Google di aplikasi | Kontrol akses memakai token link undangan, sesuai rancangan awal. Identitas petugas masih berupa nama yang diketik. |
| Upload saat aplikasi tertutup | Batasan PWA. Foto tetap aman di antrian dan terkirim begitu aplikasi dibuka. Hilang kalau nanti dibungkus jadi APK. |
| Berkas `.apk` | Butuh Node.js + Android Studio di komputer. Berkas proyeknya sudah disiapkan. |
| Logo resmi | Masih kotak "LOGO". Ganti lewat **Setelan → Watermark** begitu berkasnya ada. |

---

## Yang perlu Anda siapkan

1. **Berkas logo BPKH Wilayah XI** — PNG latar transparan, minimal 512×512 px
2. **Akun Google pemilik Drive master** — untuk memasang backend (`ppkhxi@gmail.com`)
3. **Daftar nama room** yang akan dipakai
4. **Satu HP Android** untuk uji coba pertama
