# Portal Dokumentasi BPKH Wilayah XI

Aplikasi dokumentasi foto lapangan berwatermark. Sudah berbentuk **PWA** — bisa dipasang
ke layar utama HP Android dan jalan seperti aplikasi biasa.

> **Mau langsung pasang di HP?** Buka [BUILD_APK.md](BUILD_APK.md) — Cara 1 selesai dalam 5 menit.

---

## Isi folder

Susunan lengkapnya ada di [README.md](README.md). Yang penting: folder **`www`** adalah
aplikasinya — folder itulah yang diunggah ke hosting.

---

## Cara membuka cepat di komputer

Klik dua kali **`jalankan-server.bat`**, lalu buka `http://localhost:8779` di browser.
Tampilannya jadi mockup HP di tengah layar.

Kamera **tidak akan jalan** di sini — itu batasan keamanan browser, bukan kerusakan.
Untuk menguji alurnya, pakai tombol **Foto Simulasi** di layar kamera (gambarnya dibuat
sendiri oleh aplikasi, bukan diambil dari galeri, supaya aturan *camera-only* tetap utuh).

---

## Isi aplikasi

| Layar | Isi |
|---|---|
| **Login** | Nama petugas + pilih room (simulasi; nanti diganti login akun Google) |
| **Beranda** | Kartu petugas, room aktif, 3 statistik, 6 kartu menu |
| **Ambil Foto** | Kamera penuh layar, chip GPS, pratinjau watermark, kotak **Catatan (opsional)** tepat di bawahnya, efek kilat + getar. Menekan rana **langsung menyimpan** — tanpa layar konfirmasi, jadi bisa memotret beruntun |
| **Galeri** | Grid 3 kolom, saringan *Room ini / Semua room*, titik hijau = terkirim, oranye = menunggu |
| **Tabel Rekap** | No, Nama, Room, Koordinat, Catatan, Waktu, Foto, Status + unduh PDF/DOCX |
| **Antrian Upload** | Mode (simulasi / terhubung Drive), status koneksi, daftar foto belum terkirim |
| **Pengaturan** | Alamat backend + uji koneksi, daftar room perangkat, logo watermark, nama kantor, target kompresi, pemakaian ruang & perlindungan data, ekspor metadata |

Ada satu halaman lagi khusus admin: **`admin.html`** — dibuka di komputer, dipakai untuk
membuat room, menyalin link undangan, dan melihat rekap seluruh room.

Navigasi memakai bilah bawah (Beranda · Galeri · kamera · Tabel · Setelan). Tombol
**Back Android** sudah ditangani: menutup dialog dulu, lalu mundur antar layar, dan di
Beranda perlu ditekan **dua kali** untuk keluar — persis kebiasaan aplikasi Android.

---

## Yang sudah sungguhan berjalan

- Watermark **dibakar ke piksel** foto: logo + nama kantor + koordinat GPS + tanggal-jam
- Kompresi otomatis: resize ke lebar maks 1600 px, kualitas JPEG turun bertahap sampai
  di bawah target (bawaan 500 KB). Hasil uji: **±66 KB** untuk gambar 1600×1200
- Penyimpanan lokal **IndexedDB** — foto tetap ada walau aplikasi ditutup
- Deteksi online/offline: offline → masuk antrian; kembali online → terkirim otomatis
- Service worker aktif — aplikasi tetap terbuka tanpa sinyal
- Bisa dipasang ke layar utama (spanduk "Pasang sebagai aplikasi" muncul otomatis)
- Unduh DOCX (berkas asli, terbuka di Word), PDF (dialog cetak → "Simpan sebagai PDF"),
  unduh foto satuan, dan ekspor metadata JSON

- **Upload sungguhan ke Google Drive** lewat backend Apps Script, lengkap dengan link undangan
  per room. Aktif setelah [backend/PENGATURAN_BACKEND.md](backend/PENGATURAN_BACKEND.md) dikerjakan.
- **Penjagaan data lapangan**: aplikasi meminta status penyimpanan awet ke Android supaya foto
  yang belum terkirim tidak ikut dibersihkan sistem saat memori menipis; penyimpanan penuh
  memunculkan peringatan jelas, bukan foto hilang diam-diam
- **Antrian dikirim ulang otomatis** saat aplikasi dibuka kembali dari latar belakang
- **Opsi hemat ruang**: foto boleh dihapus otomatis dari HP setelah benar-benar terkirim ke Drive

## Catatan soal "Perlindungan data" di menu Pengaturan

Statusnya bisa **Terkunci** atau **Biasa**. Android baru memberi status Terkunci setelah
aplikasi dipasang ke layar utama dan dipakai beberapa kali — saat masih dibuka lewat tab
browser biasa, statusnya wajar bertuliskan *Biasa*. Selama status masih *Biasa*, jangan
biarkan foto menumpuk lama tanpa dikirim.

## Dua mode aplikasi

| Mode | Kapan | Yang terjadi |
|---|---|---|
| **Simulasi** | Alamat backend kosong | Foto ditandai "terkirim (simulasi)" tanpa benar-benar diunggah. Cukup untuk memperagakan alur. |
| **Terhubung Drive** | Alamat backend terisi | Foto benar-benar naik ke subfolder Drive dan tercatat di spreadsheet rekap. |

Mode aktif terlihat di **Antrian Upload** dan **Setelan → Server**.

## Yang masih belum ada

| Bagian | Keterangan |
|---|---|
| **Login Google** | Kontrol akses memakai token link undangan. Identitas petugas masih nama yang diketik. |
| **Upload latar belakang** | Saat aplikasi tertutup belum jalan (batasan PWA). Teratasi kalau dibungkus jadi APK. |
| **Logo** | Masih kotak "LOGO" — ganti di menu Pengaturan begitu berkas logo resmi tersedia. |

---

## Langkah berikutnya yang masuk akal

1. **Uji lapangan dulu** dengan Cara 1 di [BUILD_APK.md](BUILD_APK.md) — pasang di 1–2 HP,
   ambil foto sungguhan, lalu periksa: watermark terbaca? koordinat akurat? ukuran file wajar?
2. **Masukkan logo resmi** BPKH Wilayah XI lewat menu Pengaturan.
3. **Pasang backend** mengikuti [backend/PENGATURAN_BACKEND.md](backend/PENGATURAN_BACKEND.md).
4. **Bungkus jadi APK** kalau upload latar belakang memang dibutuhkan.
