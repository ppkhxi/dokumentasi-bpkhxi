# RANGKUMAN — Portal Dokumentasi BPKH Wilayah XI

Catatan pegangan admin. Berisi seluruh alamat, kunci, dan prosedur penting.
Terakhir diperbarui: **21 Agustus 2026**, sistem sudah aktif dan teruji ujung ke ujung.

> **Berkas ini berisi token.** Jangan diunggah ke internet, jangan dikirim ke grup terbuka.
> Simpan di komputer admin atau Drive pribadi.

---

## 1. Alamat penting

| Untuk | Alamat |
|---|---|
| **Aplikasi petugas** | https://dokumentasi-bpkhxi.netlify.app |
| **Panel admin** | https://dokumentasi-bpkhxi.netlify.app/admin.html |
| **Folder Drive master** | https://drive.google.com/drive/folders/1c9p-VDSYLzAPeZgcSI99negl2PiEmP72 |
| **Spreadsheet rekap** | ada di dalam folder DOKUMENTASI, namanya **Rekap Dokumentasi BPKH XI** |
| **Editor backend** | https://script.google.com → proyek `dokumentasi-bpkhxi` |
| **Dashboard hosting** | https://app.netlify.com/projects/dokumentasi-bpkhxi |

### Alamat backend (dipakai panel admin)

```
https://script.google.com/macros/s/AKfycbzkmJ7szsLb8nO9VzdMNic4DfF0worK56hzN8N5pv8qIHvGdxq8IsGcwUz0-PqlIX3ZHg/exec
```

---

## 2. Kunci akses

| Kunci | Nilai | Dipakai untuk |
|---|---|---|
| **Token admin** | `bpkhXI-muecTDPyd5s5oO4st1ub` | Masuk panel admin |
| **Akun Google** | `ppkhxi@gmail.com` | Pemilik Drive, backend, hosting, dan Google Cloud |
| **Client ID** | `40977446964-7tep8466rpjlhod7dqm3vbondlg9ejt4.apps.googleusercontent.com` | Identitas aplikasi untuk login Google (bukan rahasia) |

Proyek Google Cloud: **Portal Dokumentasi BPKH XI**, status **In production**, tipe **External**.
Alamat yang terdaftar di *Authorized JavaScript origins*: `https://dokumentasi-bpkhxi.netlify.app`
— kalau alamat aplikasi berubah, alamat ini **wajib** ikut diubah atau login akan ditolak.

Token admin juga tersimpan di `backend/Code.gs` baris `TOKEN_ADMIN`.
Kalau diganti, ganti di dua tempat: Code.gs **dan** terbitkan versi baru (lihat bagian 5).

---

## 3. Link undangan yang aktif

### PPTPKH KEDIRI

```
https://dokumentasi-bpkhxi.netlify.app/?room=PPTPKH%20KEDIRI&token=bec9b42b12c04b50ba8f&api=https%3A%2F%2Fscript.google.com%2Fmacros%2Fs%2FAKfycbzkmJ7szsLb8nO9VzdMNic4DfF0worK56hzN8N5pv8qIHvGdxq8IsGcwUz0-PqlIX3ZHg%2Fexec
```

Link ini **membawa token** — perlakukan seperti kunci. Bagikan hanya ke petugas room Kediri.
Kalau bocor: panel admin → tombol **Ganti Link** → link lama langsung mati, kirim yang baru.

Link selalu bisa diambil ulang dari panel admin, jadi tidak perlu dihafal.

---

## 4. Yang dikerjakan petugas (kirim ini ke mereka)

1. Buka link undangan dari admin — sekali saja
2. Isi **Nama Petugas** → **Masuk**
3. Menu Chrome (titik tiga) → **Add to Home Screen** — supaya jalan penuh layar dan foto aman
4. Aplikasi langsung berdiri di layar kamera → izinkan **Kamera** dan **Lokasi**
5. Kalau perlu, ketik **Catatan** di kotak bawah layar kamera — boleh dikosongkan.
   Yang dikosongkan tercatat sebagai **`-`**, bukan kolom melompong.
6. Tekan tombol rana → foto **langsung tersimpan** dan terkirim. Tidak ada layar
   konfirmasi, jadi bisa memotret beruntun.
7. Untuk Galeri, Tabel Rekap, dan menu lain: tekan tombol **Menu** di kanan bawah layar kamera.
   Tombol Back mengembalikan ke kamera.

### Memilih beberapa foto sekaligus

Di **Galeri**: tekan **Pilih foto**, atau **tekan-tahan** salah satu foto. Lalu ketuk foto mana
saja untuk mencentang.

- **Unduh** — semua yang terpilih dibungkus jadi **satu berkas ZIP**. Sengaja begitu: kalau
  diunduh satu per satu, Android memblokir sisanya setelah berkas pertama.
- **Hapus** — menghapus dari HP saja. Yang sudah terkirim tetap aman di Google Drive.
- **Pilih semua** / **Batal** — mode pilih hanya berakhir lewat Batal atau tombol Back.

Titik pada foto di Galeri:

| Warna | Arti |
|---|---|
| 🟢 Hijau | Sudah masuk Drive |
| 🟠 Oranye | Menunggu sinyal, aman tersimpan di HP |
| 🔴 Merah | Gagal kirim — ketuk fotonya untuk baca sebabnya |
| ⚪ Abu-abu | Mode simulasi, **belum** masuk Drive |

### Kapan foto terkirim sendiri

Otomatis, tanpa perlu ditekan apa pun, pada tiga keadaan:

1. Begitu sinyal kembali sementara aplikasi terbuka
2. Setiap aplikasi dibuka kembali
3. Setiap kali foto baru disimpan (sekalian menyapu antrian lama)

Tombol **↻** di kanan atas hanya cadangan untuk memaksa kirim. Menekannya berulang aman —
server mengenali nomor foto yang sama, jadi tidak akan dobel.

**Syaratnya: aplikasi harus terbuka.** Kalau tertutup penuh, foto aman di HP tapi tidak ada
yang mengirim. Kebiasaan yang perlu ditanamkan ke petugas: **setiba di tempat bersinyal,
buka aplikasinya sebentar dan pastikan semua titik sudah hijau.**

### Di mana foto tersimpan di HP

Di penyimpanan internal aplikasi, **bukan** di galeri foto HP — jadi tidak bercampur dengan
foto pribadi dan tidak muncul di WhatsApp. Sekitar 500 KB per foto; pemakaiannya terbaca di
**Setelan → Penyimpanan**. Untuk salinan lepas, ada tombol **Unduh Foto** di halaman detail.

Foto di HP bisa hilang kalau: data situs Chrome dibersihkan, aplikasi dicopot dari layar
utama, memori HP menipis saat status *Perlindungan data* masih **Biasa**, atau ganti HP.
**Yang sudah hijau tetap aman** — Drive adalah salinan permanennya. Yang berisiko hanya
foto yang masih oranye atau merah.

Dua pengaman: pasang ke layar utama (status berubah jadi **Terkunci**), dan jangan biarkan
foto menumpuk lama dalam keadaan belum terkirim.

Ada saklar opsional di **Setelan → Penyimpanan**: *"Hapus foto dari HP setelah berhasil
terkirim ke Drive"* — bawaannya mati. Kalau dinyalakan, HP hemat ruang tapi Galeri dan Tabel
Rekap di HP hanya menampilkan foto yang belum terkirim.


### Kamera Ganda — dua bingkai sekaligus, simpan ke HP

Menu **Kamera Ganda** di Beranda. Satu aliran kamera dipotong jadi dua bingkai yang tampil
bertumpuk: **potret 3:4** di atas, **lanskap 16:9** di bawah. Sekali tekan rana, keluar
**dua berkas sekaligus** dari bingkai yang sama persis, watermarknya sama dengan kamera biasa.

Ada saklar **FOTO / VIDEO** di atas tombol rana.

| Mode | Keluaran |
|---|---|
| FOTO | 2 berkas JPEG — 1200×1600 dan 1920×1080 |
| VIDEO | 2 berkas MP4 (H.264) — 768×1024 dan 1280×720, batas 3 menit |

> Potret memakai **3:4**, bukan 9:16. Foto 9:16 terlalu jangkung: begitu ditaruh di
> Lembar Dokumentasi ia menyusut sampai baris watermark di kakinya tidak lagi terbaca.
> Tukarnya, hasilnya kurang pas untuk status/reels yang memang menuntut 9:16.

Tombol lain di bar bawah: **senter** (muncul hanya kalau kamera HP mendukung), **Menu**
(kembali ke Beranda), **balik kamera**, dan **mikrofon** (hanya di mode VIDEO).

**Hasilnya bukan arsip Drive.** Berkas dari menu ini sengaja tidak masuk IndexedDB, tidak
masuk antrian upload, tidak muncul di Galeri maupun Tabel Rekap, dan tidak pernah naik ke
Google Drive. Menu ini untuk keperluan lain — bahan media sosial, kiriman WhatsApp, laporan
cepat. Untuk dokumentasi resmi tetap pakai menu **Ambil Foto**.

**Cara menyimpannya ke galeri HP.** Setelah rana ditekan muncul layar hasil berisi kedua
berkas. Tekan **Simpan ke HP** → lembar bagikan Android terbuka berisi dua berkas → pilih
**Simpan ke Foto** (atau kirim langsung ke WhatsApp/Drive/mana saja).

> Halaman web tidak diizinkan Android menulis langsung ke folder DCIM, jadi lembar bagikan
> adalah jalan resminya. Tombol **Unduh** tersedia sebagai cadangan — berkas masuk folder
> **Download** dan tampil di Galeri sebagai album Download. Dua berkasnya diunduh berjeda
> 1,4 detik, karena Android memblokir unduhan yang ditembakkan beruntun.

Kalau layar hasil ditutup lewat **Buang**, berkasnya hilang — belum tersimpan di mana pun.

**Beban perangkat.** Mode VIDEO menjalankan dua encoder sekaligus. Di HP kelas menengah
wajar kalau terasa hangat dan baterai turun lebih cepat; batas 3 menit dipasang supaya
memori tidak menumpuk. Untuk rekaman panjang, potong jadi beberapa bagian.

---

## 5. Prosedur penting

### Memperbarui aplikasi

Seret folder `www` ke bagian **Production deploys** di
https://app.netlify.com/projects/dokumentasi-bpkhxi

> **Jangan** lewat `app.netlify.com/drop` — halaman itu selalu membuat situs **baru**,
> bukan memperbarui yang ada. (Pernah terjadi; sisa proyek nyasar bernama
> `keen-florentine-db71fa` boleh dihapus kapan saja.)

### Memperbarui backend

Menyimpan di editor **tidak cukup**. Setelah mengubah `Code.gs`:

**Deploy → Manage deployments → ikon pensil ✏ → Version: New version → Deploy**

Alamat `/exec` tidak berubah, jadi aplikasi tidak perlu disetel ulang.

### Memastikan versi mana yang sedang tersaji

Buka `https://dokumentasi-bpkhxi.netlify.app/sw.js` di browser — baris `const VERSI`
di paling atas menunjukkan versi aplikasi yang benar-benar hidup di server.
Kalau angkanya belum berubah setelah mengunggah, tambahkan `?cek=1` di ujung alamat
untuk melewati singgahan browser.

Versi yang terpasang di HP terbaca di **Setelan → Akun → Versi**. Kalau tertinggal,
tutup aplikasi penuh (usap dari daftar aplikasi aktif) lalu buka lagi.

### Masuk panel admin lewat aplikasi

Akun yang terdaftar di `ADMIN_EMAIL` (di `Code.gs`) akan melihat kartu **Admin** di
**Setelan** aplikasi, berisi tombol **Buka Panel Admin**. Sekali tekan, panel terbuka dan
langsung masuk — tanpa mengetik alamat server maupun token.

Petugas biasa tidak melihat kartu itu sama sekali, dan kalaupun membuka `admin.html`
langsung, sesinya ditolak backend.

### Menjadikan orang lain admin

Panel admin → bagian **Pengelola Admin** → ketik emailnya → **Tambah Admin**.
Tidak perlu menyunting `Code.gs` dan tidak perlu menerbitkan versi backend lagi.

Yang perlu dilakukan orang itu setelahnya: buka aplikasi petugas, **Masuk dengan Google**
memakai email yang sama. Kartu **Admin** akan muncul di menu **Setelan**, berisi tombol
**Buka Panel Admin**. Kalau dia sudah terlanjur masuk sebelum ditambahkan, cukup **Keluar**
lalu masuk lagi supaya sesinya diperbarui.

Ada centang **Bagikan folder Drive DOKUMENTASI sebagai pembaca**, bawaannya menyala.
Biarkan menyala kalau dia perlu melihat foto di Galeri panel — tanpa itu panel tetap terbuka
untuknya, tapi gambarnya tidak akan tampil karena Drive menolak. Mematikannya berarti dia
bisa mengelola room dan anggota, tapi tidak bisa melihat isi fotonya.

Admin baru punya hak penuh: melihat semua foto, membuat dan menonaktifkan room,
mengeluarkan anggota, dan menambah atau mencabut admin lain.

**Mencabut:** tombol **Cabut** di baris orangnya. Berlaku seketika — backend memeriksa
daftar itu setiap permintaan, bukan hanya saat login. Akses folder Drive ikut dicabut.
Foto yang sudah masuk Drive tetap tersimpan.

**Dua hal yang sengaja tidak bisa dilakukan dari panel:**

| Tidak bisa | Sebabnya |
|---|---|
| Mencabut admin bertanda **terkunci** | Itu isi `ADMIN_EMAIL` di `Code.gs` — pengaman supaya panel tidak pernah kehilangan seluruh adminnya. Ubah lewat Code.gs lalu terbitkan versi baru |
| Mencabut hak admin diri sendiri | Mencegah admin terakhir mengunci dirinya keluar tanpa sengaja |

Daftar admin tambahan disimpan di **ScriptProperties** proyek Apps Script (kunci
`ADMIN_EXTRA`), bukan di dalam kode — itu sebabnya menambah admin tidak menuntut
penerbitan versi baru.

Token admin lama tetap berlaku sebagai jalan darurat lewat komputer, misalnya kalau login
Google sedang bermasalah. Masukkan lewat `admin.html` seperti biasa.

### Membuka pengaturan server di HP petugas

Alamat backend **sengaja disembunyikan** dari menu Setelan. Petugas tidak perlu melihatnya —
sudah terisi sendiri lewat link undangan — dan salah ubah membuat foto gagal terkirim.

Kalau admin perlu memeriksa atau mengubahnya di sebuah HP:

**Setelan → bagian Akun → ketuk nomor Versi lima kali.**

Isian alamat backend beserta tombol Uji Koneksi akan muncul. Ketuk lima kali lagi untuk
menyembunyikannya. Tidak ada petunjuk cara ini di layar, jadi tidak akan ditemukan petugas
secara tidak sengaja.

### Mengganti logo watermark

Logo bawaannya lambang Kemenhut, sudah tertanam di aplikasi (`www/icons/logo-kemenhut.png`)
dan ikut tersimpan untuk keadaan tanpa sinyal — tidak perlu diatur di tiap HP.

Kalau ingin logo lain di satu HP, ganti lewat **Setelan → Watermark**. Untuk mengganti
bawaannya bagi semua petugas, timpa berkas `logo-kemenhut.png` lalu unggah ulang folder `www`.

### Mengelola anggota

Petugas **mendaftar sendiri**: buka link undangan → **Masuk dengan Google** → langsung bisa
bekerja. Namanya tidak lagi diketik, melainkan diambil dari akun Google.

Di panel admin ada bagian **Anggota Room** berisi nama, email asli, room, dan waktu bergabung.
Tombol **Keluarkan** mencabut akses seseorang — foto yang sudah terkirim tetap tersimpan,
yang masih mengantre di HP-nya tidak akan bisa dikirim sampai admin memulihkannya.

### Mewajibkan login (masa peralihan)

Bawaannya `WAJIB_LOGIN: false` di `Code.gs` — foto dari petugas yang belum login masih
diterima, supaya tidak ada yang terkunci mendadak saat sedang di lapangan.

Setelah semua petugas terbukti bisa masuk (cek daftar Anggota Room), ubah menjadi
`WAJIB_LOGIN: true`, lalu terbitkan versi baru. Sejak itu foto tanpa login ditolak.

### Kalau kantor mulai memakai domain Workspace

Isi `DOMAIN_KANTOR` di `Code.gs`, misalnya `'bpkh11.go.id'`, lalu terbitkan versi baru.
Email berdomain itu otomatis diterima tanpa perlu terdaftar satu per satu, dan tidak bisa
dikeluarkan lewat panel — cocok untuk akun resmi kantor.

### Membuat room baru

Panel admin → **Buat Room Baru** → ketik nama → **Buat Room**.
Subfolder Drive terbentuk otomatis, link undangan langsung terbit.

Kalau folder dengan nama itu sudah ada di Drive, folder lama yang dipakai — tidak dibuat kembar.

### Menarik akses sebuah room

Panel admin → **Nonaktifkan** (foto ditolak) atau **Ganti Link** (link lama mati, yang lama tetap bisa lihat kalau sudah punya link baru).

### Bagian panel yang dilipat

Sejak versi 2.9 panel admin dan menu **Setelan** di aplikasi hanya menampilkan **daftar judul**.
Isinya turun saat judulnya diketuk, dan naik lagi kalau diketuk sekali lagi. Keadaan
terbuka/tertutup tiap bagian diingat per peramban, jadi bagian yang sering dipakai tetap
terbuka di kunjungan berikutnya.

Dua hal yang perlu diketahui:

- Bagian **Peta Sebaran** digambar ulang setiap kali dibuka. Peta memerlukan ukuran wadahnya;
  kalau digambar saat masih terlipat, hasilnya kosong.
- Pintu belakang **ketuk nomor versi lima kali** tetap berlaku, dan sekarang sekalian membuka
  kartu Server-nya — dulu isiannya muncul tapi kartunya masih tertutup.

### Melihat galeri foto di panel admin

Panel admin → bagian **Galeri Foto**. Ada saringan **room** sendiri, terpisah dari saringan
di Rekap, jadi bisa melihat room yang satu di galeri sambil tabel rekapnya menampilkan yang
lain. Foto terbaru di depan, dimuat 60 sekaligus dengan tombol **Tampilkan lebih banyak**.

Ketuk salah satu foto untuk melihatnya besar beserta petugas, email, room, waktu ambil,
waktu diterima, koordinat, catatan, ukuran berkas, dan tautan ke berkas aslinya di Drive.

> **Kalau kotaknya kosong dan tertulis "Tidak bisa dimuat".** Gambarnya diambil langsung dari
> Google Drive, bukan lewat backend — jadi peramban yang dipakai harus sedang masuk ke akun
> Google yang berhak melihat folder DOKUMENTASI. Buka akun itu di tab lain, lalu muat ulang
> panel. Untuk admin tambahan, pastikan centang berbagi Drive dinyalakan waktu dia
> ditambahkan.
>
> Ini dipilih dengan sengaja: foto tidak perlu dibuka ke publik, dan Apps Script tidak perlu
> mengangkut berkas gambar bolak-balik.

### Rasio foto

Sejak 2.9.1 kamera utama memotret **3:4 tegak**, sama dengan bingkai potret di Kamera Ganda.
Layar kamera menampilkan bingkai 3:4 dengan bilah hitam di atas dan bawah — apa yang terlihat
di dalam bingkai itulah yang tersimpan, tidak ada bagian yang ikut terpotret diam-diam.
Bilah hitam di bawah bingkai dipakai untuk kotak **Catatan**, jadi catatan tidak lagi
menutupi bagian bawah foto seperti sebelumnya.

Alasannya lembar dokumentasi: foto 3:4 mengisi kotak di **Lembar Foto** dengan pas, sehingga
baris watermark di kakinya tetap terbaca. Rasio 16:9 atau 9:16 menyisakan banyak ruang kosong
dan menyusutkan fotonya.

Tukarnya ada dua: sebagian bidang pandang kamera terbuang, dan resolusinya turun — dari
sensor mendatar 1920×1080 hanya terpakai 810×1080. Kalau HP dipegang tegak, biasanya
1080×1440 yang terpakai.

### Lembar Dokumentasi Foto (lampiran laporan)

**Aplikasi HP → Tabel Rekap → Lembar Foto**. Tata letak kedua untuk unduhan: kop di atas,
lalu foto berbingkai tersusun dalam kisi — bentuk lampiran laporan lapangan, bukan tabel data.

Sebelum diunduh muncul dua pilihan:

| Pilihan | Keterangan |
|---|---|
| **Kop lembar** | Bebas diketik, satu baris = satu baris cetak. Bawaannya terisi nama kantor dan room, tinggal diganti |
| **Foto per lembar** | 4 (2×2), 6 (2×3), 9 (3×3), atau 12 (3×4) |

Keluarannya A4 **tegak**, kop diulang di tiap lembar supaya tiap halaman berdiri sendiri
kalau nanti terpisah. Tersedia sebagai PDF maupun DOCX.

Foto dipasang **utuh, tidak dipotong**. Kalau dipotong agar penuh mengisi kotaknya, baris
watermark di kaki foto ikut terpangkas dan lembarnya kehilangan nilai buktinya. Akibatnya
foto yang rasionya berbeda dari kotaknya akan menyisakan ruang kosong — itu disengaja.

> **Kepadatan dan keterbacaan.** Pada 9 dan 12 foto per lembar, tulisan watermark jadi sangat
> kecil: masih terbaca kalau PDF-nya diperbesar di layar, tapi tidak lagi terbaca pada hasil
> cetak kertas. Untuk lampiran yang akan dicetak dan dibaca orang lain, pakai 4 atau 6.

Jatah tinggi kop mengikuti jumlah barisnya, jadi kop enam baris sekalipun tidak akan
mendorong baris foto terakhir ke halaman berikutnya.

### Mengunduh rekap

- **Panel admin** → Rekap Dokumentasi → **Unduh CSV** (buka di Excel)
- **Aplikasi HP** → Tabel Rekap → **Unduh PDF** atau **Unduh DOCX**
- **Spreadsheet** di Drive — selalu terisi otomatis

### Peta sebaran dan ekspor ke GIS

Ada di dua tempat: **panel admin** (bagian Peta Sebaran, mengikuti saringan room di Rekap)
dan **aplikasi HP** (menu **Peta Sebaran** di Beranda).

Tiap foto jadi satu titik; diketuk memunculkan foto, petugas, waktu, koordinat, dan catatannya.
Warna titik dibedakan per room. Lingkaran samar di sekelilingnya menunjukkan ketelitian GPS.

Dua format unduhan, keduanya ada di panel admin maupun aplikasi:

| Format | Dibuka di | Isinya |
|---|---|---|
| **KML** | Google Earth | Titik berwarna per room, keterangan lengkap, tautan ke foto di Drive |
| **GeoJSON** | ArcGIS Pro, QGIS | Atribut: petugas, email, room, waktu, catatan, akurasi_m, berkas, link_drive |

GeoJSON memakai CRS84 (WGS 84 lintang-bujur) — langsung terbaca tanpa perlu menentukan
proyeksi. Cocok di-overlay dengan batas kawasan hutan lalu dicetak memakai template layout
yang sudah ada.

> **Batas ketelitian.** Koordinat dari HP berkisar ±5 sampai ±80 meter tergantung sinyal dan
> tutupan tajuk. Cukup untuk menunjukkan di sekitar mana dokumentasi diambil, **bukan**
> pengganti pengukuran geodetik untuk penetapan batas. Nilai akurasi tiap titik ikut tersimpan
> di KML maupun GeoJSON supaya pembaca peta tahu ketelitiannya.

Peta memerlukan internet untuk memuat latar petanya. Tanpa sinyal, aplikasi menampilkan
keterangan dan menyarankan mengunduh KML/GeoJSON — data titiknya tetap aman.

---

## 6. Kalau ada masalah

| Gejala | Sebab & perbaikan |
|---|---|
| Titik abu-abu, foto tak masuk Drive | HP belum punya alamat server → buka ulang link undangan |
| "Token undangan tidak cocok" | Link sudah diganti admin → kirim link baru |
| "Tidak bisa menghubungi server" | Sinyal lemah. Foto aman di HP, terkirim sendiri saat online |
| "Jawaban server tidak dikenali" | Deployment bukan **Anyone** → ulangi penerbitan web app |
| Aplikasi masih versi lama | Tutup penuh dari daftar aplikasi aktif, buka lagi |
| Perubahan Code.gs tak terasa | Belum diterbitkan versi baru — lihat bagian 5 |
| Foto hilang sebelum terkirim | Status *Perlindungan data* masih **Biasa** → pasang ke layar utama |
| "Perlu masuk ulang" muncul | Sesi 90 hari habis, atau akses dicabut admin. Foto aman, terkirim setelah masuk lagi |
| Tombol Google tidak muncul | Tidak ada sinyal (skrip Google tidak bisa diunduh), atau alamat server belum diisi. Isian nama manual muncul sebagai cadangan |
| "Login berasal dari aplikasi lain" | `CLIENT_ID` di `Code.gs` berbeda dengan yang di aplikasi |
| Login ditolak Google | Alamat aplikasi belum terdaftar di *Authorized JavaScript origins* di Google Cloud |
| Sebagian kartu Beranda tidak bisa disentuh | Bug versi 2.8.0 ke bawah — layar kamera yang tersembunyi masih menadah sentuhan. Perbarui ke 2.8.1 |

---

## 7. Sisa pekerjaan

| Hal | Keterangan |
|---|---|
| **Logo resmi** | PNG latar transparan min. 512×512. Masuk lewat **Setelan → Watermark**, diatur per HP. |
| **Login akun Google** | Belum ada. Nama petugas masih ketikan bebas — sistem mencatat siapa yang *mengaku*, bukan yang *terverifikasi*. Perlu ditinjau kalau foto dipakai sebagai alat bukti formal. |
| **Berkas APK** | Butuh Node.js + Android Studio. Berkas proyek Capacitor sudah siap di folder ini. |
| **Upload saat aplikasi tertutup** | Batasan PWA. Foto aman di antrian, terkirim saat aplikasi dibuka. Hilang kalau nanti jadi APK. |

---

## 8. Batas pemakaian Google (akun gratis)

| Hal | Batas | Berlaku untuk kita? |
|---|---|---|
| Penyimpanan Drive | 2 TB (langganan akun ini) | Ya — cukup untuk puluhan tahun |
| Waktu jalan skrip | 6 menit per permintaan | Ya — satu foto hanya beberapa detik |
| URL Fetch | 20.000 / hari | Ya — dipakai 1× tiap login, jauh dari batas |
| *Documents created* 250 / hari | pembuatan **Google Docs** | **Tidak** — foto JPEG bukan Google Docs |
| *Spreadsheets created* 250 / hari | pembuatan **Google Sheets** | **Tidak** — spreadsheet rekap dibuat sekali saja |

> **Catatan koreksi.** Halaman kuota Apps Script **tidak** mencantumkan batas harian untuk
> pembuatan berkas biasa di Drive. Angka 250 yang beredar merujuk pada *Documents created*
> (Google Docs), bukan unggahan JPEG lewat `DriveApp.createFile()`. Jadi tidak ada plafon
> harian yang diketahui untuk jumlah foto.

Yang lebih mungkin terasa lebih dulu bukan kuota, melainkan **kecepatan unggah di lapangan**:
70 foto × 500 KB = 35 MB per petugas per hari. Di sinyal lemah, itu perlu waktu.

Google tetap membatasi lonjakan permintaan tanpa mengumumkan angkanya, tapi sifatnya
sementara — muncul sebagai foto gagal kirim yang otomatis dicoba ulang, bukan pintu tertutup
seharian.

---

## 9. Riwayat versi aplikasi

| Versi | Perubahan |
|---|---|
| 1.0 | Aplikasi satu halaman: kamera, watermark, kompresi, galeri, tabel rekap, unduh PDF/DOCX |
| 1.1 | Jadi PWA — bisa dipasang ke layar utama, jalan tanpa sinyal |
| 1.2 | Penjagaan data: minta penyimpanan awet ke Android, peringatan memori penuh, penjaga tekan-ganda |
| 1.3 | Foto simulasi ditandai abu-abu (dulu hijau, menyesatkan); alamat server ikut di link undangan; sinyal lemah tidak lagi membatalkan undangan |
| 1.4 | Catatan pindah ke layar kamera dan tidak wajib; rana langsung menyimpan tanpa layar konfirmasi |
| 1.4.1 | Catatan yang dikosongkan tercatat sebagai `-` |
| 2.0 | **Login akun Google.** Identitas petugas terverifikasi, pendaftaran anggota mandiri lewat link undangan, pengelolaan anggota di panel admin, sesi 90 hari supaya foto offline tetap terkirim |
| 2.1 | Logo Kemenhut jadi watermark bawaan, alamat server disembunyikan dari petugas, ikon menu diganti SVG |
| 2.2 | Aplikasi berdiri di layar kamera setelah login; tombol **Menu** di layar kamera membuka Beranda |
| 2.3 | **Peta sebaran** di panel admin dan aplikasi, plus unduhan **KML** dan **GeoJSON** untuk Google Earth / ArcGIS / QGIS |
| 2.4 | Pilih beberapa foto di Galeri — unduh sekaligus sebagai satu **ZIP**, atau hapus sekaligus |
| 2.5 | Panel admin bisa dibuka dari **Setelan** aplikasi untuk akun admin, tanpa mengetik alamat maupun token (backend v2.1) |
| 2.6 | **Pindah room tanpa keluar akun.** Aksi backend `roomSaya` mengembalikan room yang diikuti akun ini; menu Room di beranda menariknya otomatis, jadi room menempel ke akun bukan ke HP |
| 2.7 | **Kamera Ganda.** Satu rana menghasilkan dua berkas berwatermark sekaligus (potret 9:16 + lanskap 16:9), mode FOTO atau VIDEO, disimpan ke HP lewat lembar bagikan — sengaja tidak masuk Drive maupun rekap |
| 2.8 | **Galeri di panel admin** dengan saringan room sendiri dan tampilan foto besar, plus **Pengelola Admin** — menambah/mencabut admin langsung dari panel tanpa menyunting Code.gs (backend v2.3) |
| 2.8.1 | **Perbaikan: kartu Beranda tidak bisa disentuh.** Elemen `<video>` kamera menyimpan `visibility:visible` sebaris yang tidak pernah dilepas, jadi tetap menerima sentuhan walau layarnya sudah disembunyikan — dan `translateX(14%)` memarkirnya di atas Beranda. Layar tak aktif kini `pointer-events:none` |
| 2.9 | **Lembar Dokumentasi Foto** — unduhan PDF/DOCX bertata letak lampiran laporan, kop bebas diketik, 4/6/9/12 foto per lembar. Panel admin dan Setelan dilipat jadi daftar judul. Potret Kamera Ganda diubah dari 9:16 ke 3:4 |
| 2.9.1 | **Kamera utama ikut 3:4.** Pratinjau dikurung dalam bingkai 3:4 dan rana memotong dengan hitungan yang sama, jadi yang terlihat di layar sama persis dengan yang tersimpan. Sebelumnya berkasnya mengikuti rasio bawaan kamera HP |
| 2.9.2 | Kotak **Catatan** pindah dari atas foto ke bilah hitam di bawah bingkai — bagian bawah foto tidak lagi tertutup, dan ruang yang tadinya kosong jadi terpakai |

Versi backend (`Code.gs`) terpisah dan jarang berubah — terbaca lewat
`…/exec?aksi=ping`.

| Versi backend | Perubahan |
|---|---|
| 2.1 | Sesi admin, panel bisa dibuka dari aplikasi tanpa token |
| 2.2 | Aksi `roomSaya` — room menempel ke akun, bukan ke HP |
| 2.3 | **Pengelolaan admin lewat panel.** Aksi `daftarAdmin` dan `ubahAdmin`; admin tambahan disimpan di ScriptProperties, berbagi folder Drive ikut diatur otomatis |

---

## 10. Pekerjaan lanjutan

1. **Nyalakan `WAJIB_LOGIN`** setelah semua petugas terbukti bisa masuk (lihat bagian 5)
2. **Isi `DOMAIN_KANTOR`** kalau kantor mulai memakai domain Workspace
3. **Logo 120×120** untuk layar login Google — opsional, diunggah di Google Cloud →
   Google Auth Platform → Branding

> Butir *pengelolaan admin lewat panel* sudah selesai di backend 2.3 — lihat
> **Menjadikan orang lain admin** di bagian 5.
