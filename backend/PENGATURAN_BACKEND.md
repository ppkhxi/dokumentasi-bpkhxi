# Memasang Backend (Google Apps Script)

Backend inilah yang membuat upload ke Google Drive **benar-benar terjadi** — bukan tiruan lagi.
Tidak perlu menyewa server, tidak perlu memasang apa pun di komputer.

Perkiraan waktu: **20–30 menit**, sekali saja.

> **Penting:** seluruh langkah di bawah harus dikerjakan sambil login memakai **akun Google
> pemilik folder DOKUMENTASI** (saat ini `ppkhxi@gmail.com`). Kalau salah akun, backend tidak
> akan bisa menulis ke folder itu.

---

## Langkah 1 — Membuat proyek Apps Script

1. Buka <https://script.google.com>
2. Klik **New project** (Proyek baru)
3. Klik nama proyek di kiri atas (`Untitled project`), ganti jadi
   **Backend Dokumentasi BPKH XI**
4. Hapus seluruh isi editor (kode contoh `function myFunction() {}`)
5. Buka berkas **`Code.gs`** dari folder ini, salin **seluruh** isinya, tempel ke editor
6. Tekan **Ctrl+S** untuk menyimpan

## Langkah 2 — Mengisi KONFIG

Di bagian atas kode ada blok `const KONFIG = {`. Tiga baris berikut wajib diisi:

### `ID_FOLDER_MASTER`

Sudah terisi `1c9p-VDSYLzAPeZgcSI99negl2PiEmP72` — itu ID folder DOKUMENTASI Anda.
Kalau nanti pindah folder, ambil ID dari alamat foldernya:

```
https://drive.google.com/drive/folders/1c9p-VDSYLzAPeZgcSI99negl2PiEmP72
                                       └──────── bagian ini ────────┘
```

### `TOKEN_ADMIN`

**Wajib diganti.** Ini kunci yang menentukan siapa boleh membuat room. Pakai huruf-angka acak
minimal 20 karakter, contoh:

```
bpkhXI-7fK29mQz4Lp8vRn3
```

Simpan di tempat aman (catatan pribadi / pengelola kata sandi). Kalau hilang, Anda bisa
mengubahnya lagi di Code.gs kapan saja.

### `ALAMAT_APLIKASI`

Alamat PWA yang sudah Anda unggah (lihat `BUILD_APK.md` Cara 1), contoh:

```
https://dokumentasi-bpkhxi.netlify.app
```

Tanpa garis miring di akhir. Kalau belum sempat mengunggah aplikasinya, isi dulu apa adanya —
tapi ingat link undangan baru benar setelah baris ini diperbaiki.

Tekan **Ctrl+S** lagi.

## Langkah 3 — Memberi izin (sekali saja)

1. Di daftar fungsi bagian atas, pilih **`ujiPengaturan`**
2. Klik **Run**
3. Muncul permintaan izin → **Review permissions** → pilih akun Google Anda
4. Muncul layar peringatan **"Google hasn't verified this app"**.
   Ini normal: peringatan itu muncul untuk semua skrip buatan sendiri yang belum melewati
   proses verifikasi Google. Karena skrip ini Anda pasang sendiri di akun sendiri, aman untuk
   dilanjutkan → klik **Advanced** → **Go to Backend Dokumentasi BPKH XI (unsafe)** → **Allow**
5. Lihat hasilnya di panel **Execution log** di bawah. Yang benar terlihat seperti ini:

```
✓ Folder master ditemukan: "DOKUMENTASI"
✓ TOKEN_ADMIN sudah diganti (23 karakter)
✓ ALAMAT_APLIKASI: https://dokumentasi-bpkhxi.netlify.app
✓ Spreadsheet siap: https://docs.google.com/spreadsheets/d/…
• Room terdaftar: belum ada
```

Kalau ada tanda ✗, perbaiki dulu baris KONFIG yang disebut, lalu jalankan `ujiPengaturan` lagi.

Spreadsheet **Rekap Dokumentasi BPKH XI** otomatis dibuat di dalam folder DOKUMENTASI —
itulah basis data rekapnya.

## Langkah 4 — Menerbitkan sebagai layanan web

1. Klik **Deploy** (kanan atas) → **New deployment**
2. Klik ikon roda gigi ⚙ di sebelah "Select type" → pilih **Web app**
3. Isi:
   - **Description:** `versi 1`
   - **Execute as:** **Me (akun Anda)** ← wajib, ini yang memberi hak tulis ke Drive
   - **Who has access:** **Anyone** ← wajib, supaya HP petugas bisa mengirim
4. Klik **Deploy**
5. Salin **Web app URL** yang muncul. Bentuknya:

```
https://script.google.com/macros/s/AKfycb................/exec
```

Simpan alamat ini. Inilah "alamat backend" yang diminta aplikasi dan panel admin.

### Kenapa "Anyone" aman di sini

"Anyone" hanya berarti alamat itu bisa dihubungi tanpa login Google. Tapi setiap permintaan
tetap ditolak kalau tidak membawa **token room** yang sah (untuk petugas) atau **token admin**
(untuk membuat room). Jadi yang menjaga pintu adalah token, bukan login.

Yang perlu dijaga: **jangan sebar alamat backend beserta token di grup terbuka.**
Kalau sebuah link undangan bocor, admin tinggal menekan **Ganti Link** di panel admin —
link lama langsung mati.

## Langkah 5 — Membuat room pertama

1. Buka berkas **`admin.html`** (ada di folder `www`) — bisa lewat alamat aplikasi Anda,
   misalnya `https://dokumentasi-bpkhxi.netlify.app/admin.html`
2. Isi **Alamat Backend** dengan URL `/exec` tadi
3. Isi **Token Admin** dengan nilai `TOKEN_ADMIN` yang Anda tulis di Code.gs
4. Klik **Masuk**
5. Di kotak **Buat Room Baru**, ketik misalnya `PPTPKH KEDIRI` → **Buat Room**

Subfolder langsung terbentuk di Drive, dan link undangannya muncul. Klik **Salin**, lalu kirim
link itu ke petugas lewat WhatsApp.

> Room `PPTPKH KEDIRI` sudah ada sebagai folder di Drive Anda. Kalau namanya diketik persis
> sama, backend memakai folder yang sudah ada — tidak membuat folder kembar.

## Langkah 6 — Menyambungkan aplikasi petugas

Di HP petugas:

1. Buka link undangan dari admin → muncul pemberitahuan **"Undangan diterima"**
2. Buka menu **Setelan → Server**, tempel **Alamat Backend**, tekan **Uji Koneksi**
   (harus muncul "Berhasil terhubung"), lalu **Simpan**
3. Selesai. Mulai sekarang setiap foto benar-benar naik ke Drive.

Di menu **Antrian Upload** statusnya berubah dari *Mode simulasi* menjadi
**Terhubung ke Drive**.

---

## Kalau nanti kode backend diubah

Menyimpan saja **tidak cukup** — perubahan belum aktif sampai versi baru diterbitkan:

**Deploy → Manage deployments → ikon pensil ✏ → Version: New version → Deploy**

Alamat `/exec` tidak berubah, jadi aplikasi tidak perlu disetel ulang.

---

## Batas pemakaian (kuota Google, akun gratis)

| Hal | Batas |
|---|---|
| Penyimpanan Drive | sesuai kuota akun |
| Waktu jalan skrip | 6 menit per permintaan |
| URL Fetch (dipakai saat login) | 20.000 / hari |

Halaman kuota Apps Script **tidak** mencantumkan batas harian untuk pembuatan berkas biasa di
Drive. Angka 250 yang sering disebut merujuk pada *Documents created* — pembuatan Google Docs —
bukan unggahan JPEG lewat `DriveApp.createFile()`.

Yang lebih mungkin terasa lebih dulu adalah kecepatan unggah dari lapangan, bukan kuota.

---

## Kalau ada masalah

| Gejala | Sebab & perbaikan |
|---|---|
| "Jawaban server tidak dikenali" | Deployment belum "Anyone" → ulangi Langkah 4, atau URL bukan yang berakhiran `/exec` |
| "Token undangan tidak cocok" | Link undangan sudah diganti admin → kirim link baru ke petugas |
| "Room tidak terdaftar" | Room dibuat manual di Drive, bukan lewat panel admin → buat lewat panel admin |
| "TOKEN_ADMIN belum diganti" | Langkah 2 terlewat |
| Foto tidak masuk, status "Gagal kirim" | Buka detail foto → lihat pesannya. Foto tetap aman di HP dan dikirim ulang otomatis saat aplikasi dibuka lagi |
| Perubahan kode tidak terasa | Belum diterbitkan versi baru — lihat bagian "Kalau nanti kode backend diubah" |
