# Cara Memasang di Android

Ada dua cara. Cara 1 **bisa dipakai hari ini** tanpa memasang apa pun di komputer.
Cara 2 menghasilkan berkas `.apk` sungguhan, tapi butuh Node.js + Android Studio.

---

## Cara 1 — Pasang sebagai aplikasi lewat browser (PWA) ✅ paling cepat

Hasilnya: ikon di layar utama HP, jalan **penuh layar tanpa tampilan browser**,
kamera + GPS aktif, dan tetap bisa dibuka saat tidak ada sinyal.

### Langkah

1. Buka <https://app.netlify.com/drop> di komputer.
2. **Seret folder `www`** (bukan isinya satu-satu) ke kotak di halaman itu.
3. Tunggu beberapa detik — muncul alamat seperti `https://nama-acak-123.netlify.app`.
4. Buka alamat itu di **Chrome HP Android**.
5. Muncul spanduk kuning **"Pasang sebagai aplikasi"** di Beranda → tekan **Pasang Sekarang**.
   Kalau tidak muncul: menu titik tiga Chrome → **Tambahkan ke layar utama**.
6. Selesai. Ikon aplikasinya muncul di layar utama.

### Saat pertama dipakai, HP akan meminta dua izin

- **Kamera** → harus *Izinkan*, kalau tidak tombol rana tidak berfungsi
- **Lokasi** → harus *Izinkan saat menggunakan aplikasi*, kalau tidak koordinat di
  watermark akan kosong

Kalau tidak sengaja ditolak: Chrome → titik tiga → Setelan situs → cari alamat situsnya
→ ubah Kamera dan Lokasi jadi *Izinkan*.

### Kalau nanti aplikasinya diperbarui

Seret ulang folder `www` ke Netlify Drop yang sama, lalu tutup dan buka lagi aplikasinya
di HP. Naikkan juga angka `VERSI` di `sw.js` supaya versi lama benar-benar tergantikan.

**Batasan yang jujur:** karena masih PWA, upload otomatis di latar belakang ketika
aplikasi tertutup belum berjalan. Foto tetap aman di antrian lokal dan terkirim begitu
aplikasi dibuka lagi dalam keadaan online.

---

## Cara 2 — Bangun berkas APK sungguhan (Capacitor)

Perlu dipasang lebih dulu di komputer (belum ada saat ini):

| Perangkat | Keterangan |
|---|---|
| **Node.js LTS** | <https://nodejs.org> — pilih versi LTS |
| **Android Studio** | <https://developer.android.com/studio> — sekaligus membawa Android SDK |
| **JDK 17** | biasanya sudah ikut terpasang bersama Android Studio |

Total unduhan sekitar 6–10 GB.

### Langkah

Jalankan dari folder `D:\DOKUMENTASI APP`:

```bash
npm install
```

```bash
npx cap add android
```

```bash
npx cap sync android
```

Lalu tambahkan izin di `android/app/src/main/AndroidManifest.xml`, tepat di atas
baris `<application`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-feature android:name="android.hardware.camera" android:required="true" />
```

Buka proyeknya di Android Studio:

```bash
npx cap open android
```

Di Android Studio: menu **Build → Build Bundle(s)/APK(s) → Build APK(s)**.

Hasilnya ada di:

```
D:\DOKUMENTASI APP\android\app\build\outputs\apk\debug\app-debug.apk
```

Salin berkas itu ke HP, buka, izinkan "Instal dari sumber tidak dikenal" → terpasang.

### Kenapa cara ini lebih baik untuk jangka panjang

- Kamera dan GPS memakai izin Android asli, tidak terikat aturan browser
- Bisa jalan di latar belakang (upload otomatis walau aplikasi ditutup)
- Bisa diunggah ke Play Store kalau nanti diperlukan
- Ikon dan nama aplikasi sepenuhnya milik sendiri

### Mengganti ikon aplikasi APK

Berkas `www/icons/icon-512.png` dan `www/icons/splash-1080.png` sudah tersedia.
Di Android Studio: klik kanan folder `res` → **New → Image Asset** → pilih berkas itu.

---

## Ringkasan keputusan

Kalau tujuannya **segera dipakai petugas lapangan minggu ini** → pakai **Cara 1**.
Kalau tujuannya **aplikasi resmi kantor jangka panjang** → tetap mulai dari Cara 1
untuk uji coba, lalu siapkan Cara 2 sambil menunggu backend selesai.
