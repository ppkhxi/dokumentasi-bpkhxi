# SKEMA PETA, FITUR OFFLINE, DAN AKURASI TITIK
**Aplikasi Dokumentasi BPKH Wilayah XI (dkpoint v3.9.6)**

Dokumen ini menjelaskan secara teknis dan praktis mengenai arsitektur peta, mekanisme kerja offline di wilayah tanpa sinyal (blank spot), serta penanganan akurasi GPS di lapangan.

---

## 1. Skema & Arsitektur Peta

Peta dibangun menggunakan pustaka **Leaflet (v1.9.4)** yang dioptimasi khusus untuk performa tinggi di perangkat smartphone lapangan (*low-memory footprint & battery-efficient*).

### A. Hirarki Tumpukan Lapisan (Layer Stacking / Z-Index)
Agar objek spasial tidak saling menutupi sembarangan, peta menerapkan urutan tumpukan:
1. **Lapis Basemap (Paling Dasar / Z: 0)**
   - Pilihan: **Google Satelit**, **Google Hybrid** (Satelit + Jalan), **Google Maps**, dan **OpenStreetMap (OSM)**.
   - Menggunakan format ubin standar XYZ yang ringan dan responsif.
2. **Lapis Peta Raster / Georeferensi (Z: 1 – 9)**
   - Mendukung format **GeoPDF (dari ArcGIS / QGIS)**, citra satelit JPG/PNG, dan peta kawasan berformat PDF.
   - Memiliki fitur deteksi otomatis koordinat dunia nyata (*GeoPDF GPTS metadata* & *EXIF GPS*), serta pengaturan opasitas transparan dan **Kalibrasi Freehand Sentuh (↖ ↗ ↘ ↙)** langsung di layar HP.
3. **Lapis Vektor Spasial KML / KMZ / GeoJSON (Z: 10 – 40)**
   - Menggambar poligon kawasan, batas petak, garis trayek patroli, dan titik patok batas.
   - Parser KML mandiri (*native DOMParser*) tanpa membutuhkan library pihak ketiga atau server eksternal.
   - Label toponimi/nama objek dapat diaktifkan atau dinonaktifkan per-layer (**🏷️ ON/OFF**).
4. **Lapis Digitasi Garis & GPS Tracking Live (Z: 45)**
   - Merekam garis manual (*digit line*) atau merekam jejak langkah patroli GPS secara langsung saat berjalan.
   - Garis yang disimpan otomatis masuk ke basis data lapisan dan dapat diekspor ke KML.
5. **Lapis Titik Foto Survei Lapangan (Z: 50)**
   - Titik foto dengan warna berbeda per-room.
   - Dilengkapi lingkaran radius akurasi GPS dan popup kartu ringkas berisi foto, nama petugas, waktu, dan catatan.
6. **Lapis Posisi Pengguna (Paling Atas / Z: 100)**
   - Titik denyut biru posisi GPS saat ini (*real-time user location*) beserta lingkaran radius ketidakpastian.

---

## 2. Fitur Offline (Bekerja Tanpa Sinyal / Blank Spot di Hutan)

Aplikasi beroperasi sebagai **Progressive Web App (PWA)** dengan kapabilitas **100% Offline-Ready**:

### A. Ubin Peta Offline (Service Worker Cache: `dkpoint-tiles-v1`)
- Setiap kali pengguna melihat peta satelit atau peta jalan saat ada internet/Wi-Fi, Service Worker secara otomatis menyimpan ubin citra (*tiles*) tersebut ke dalam **Cache Storage lokal perangkat**.
- **Strategi Cache-First**: Saat pengguna berada di hutan tanpa koneksi internet sama sekali, aplikasi langsung mengambil ubin yang tersimpan di memori HP.
- **Optimasi Konsumsi Memori**:
  - `keepBuffer: 2`: menjaga ubin di sekitar layar agar pergeseran peta (*panning*) tetap mulus tanpa membebani RAM HP.
  - `updateWhenIdle: true`: hanya memuat ubin saat layar berhenti digeser, menghemat baterai HP di lapangan.
  - `updateWhenZooming: false`: mencegah rendering ubin berulang saat melakukan cubit pembesaran (*pinch-to-zoom*).

### B. Penyimpanan Spasial Lokal (IndexedDB)
- Seluruh berkas KML, GeoJSON, jejak tracking, dan citra raster peta kerja disimpan di dalam basis data browser **IndexedDB** (`peta_kml` dan `peta_raster`).
- Data tidak disimpan di cloud untuk pemetaan dasar, sehingga:
  - Pembukaan layer bersifat instan (0 detik latensi).
  - Data spasial rahasia tetap berada di penyimpanan internal perangkat petugas.
  - Tidak ada kuota internet yang terpakai saat menyalakan layer di hutan.

### C. 1 Pintu Input Dokumen Perangkat
- Formulir input berkas kini menyatukan KML, KMZ, GeoJSON, GeoPDF, PDF, dan gambar raster dalam **satu dialog terpadu**.
- Berkas diambil langsung dari **Dokumen / Penyimpanan Internal Perangkat (File Manager)**, bukan dari galeri foto kamera, memastikan format asli berkas spasial tetap utuh tanpa rusak akibat kompresi galeri.

---

## 3. Akurasi Titik GPS & Pengukuran

### A. Standar Ketelitian GPS di Perangkat Mobile
- Menggunakan parameter `enableHighAccuracy: true` pada API Geolocation browser:
  - Memaksa perangkat menggunakan chip **GNSS/GPS fisik** (GPS, GLONASS, Galileo, BeiDou), bukan estimasi alamat IP atau menara BTS operator seluler.
  - `maximumAge: 0`: memastikan posisi yang diambil adalah koordinat satelit terkini (*fresh fix*).
- **Nilai Akurasi (± Meter)**:
  - Ditampilkan secara transparan di bilah status atas (misal: `📍 ± 3 m`).
  - Nilai ini merupakan *Horizontal Dilution of Precision* (HDOP 68% confidence interval).
  - Jika akurasi $\le 5\text{ m}$, titik sangat presisi untuk tanda batas dan dokumentasi patok.
  - Jika akurasi $> 20\text{ m}$, aplikasi menampilkan lingkaran biru lebar sebagai peringatan visual bahwa sinyal satelit terhalang tajuk pohon lebat atau tebing.

### B. Filter Jitter pada GPS Tracking Patroli
- Saat petugas mengaktifkan **🛰️ GPS Tracking Live**, sistem menerapkan dua filter cerdas:
  1. **Akurasi Threshold**: Koordinat yang memiliki akurasi lebih buruk dari 80 meter diabaikan secara otomatis untuk mencegah titik "melompat liar".
  2. **Jarak Minimum Pergeseran (3 meter)**: Titik baru hanya ditambahkan jika jarak dari titik sebelumnya minimal 3 meter. Ini mencegah jejak garis menjadi ruwet/zig-zag saat petugas berhenti sejenak untuk istirahat.

### C. Formula Perhitungan Geodesik (Jarak & Luas Area)
- **Pengukuran Jarak (Meteran)**:
  - Menggunakan formula *Haversine Geodesic* pada elipsoid bumi WGS-84 ($R = 6.378.137\text{ m}$).
  - Menghitung jarak lengkung bumi yang sebenarnya, bukan jarak datar Euclidean Cartesian yang bisa mengalami distorsi di wilayah khatulistiwa.
- **Pengukuran Luas Area (Meteran Luas)**:
  - Menggunakan formula *Spherical Trapezoidal Geodesic Shoelace*:
    $$A = \frac{R^2}{2} \left| \sum_{i=1}^{n} (\lambda_{i+1} - \lambda_i)(2 + \sin \phi_i + \sin \phi_{i+1}) \right|$$
  - Hasil perhitungan otomatis diformat:
    - Jika $< 10.000\text{ m}^2$: ditampilkan dalam $\text{m}^2$ (misal: `4.520 m²`).
    - Jika $\ge 10.000\text{ m}^2$ (1 Hektar): otomatis dikonversi ke satuan **Hektar (Ha)** dan $\text{m}^2$ (misal: `2,35 Ha (23.500 m²)`).
    - Sangat cocok untuk penghitungan luas tutupan lahan, blok tebangan, dan kawasan rehabilitasi BPKH.

---

## 4. Tips Lapangan untuk Petugas
1. **Sebelum Berangkat ke Hutan (Saat Masih Ada Internet)**:
   - Buka aplikasi dkpoint, masuk ke menu **Peta Sebaran**.
   - Geser dan perbesar (zoom in) area target survei pada basemap Google Satelit sampai level batas petak. Dengan cara ini, seluruh ubin satelit target otomatis tersimpan di HP (*cached*).
   - Masukkan KML batas kawasan dan peta kerja (GeoPDF/JPG) melalui tombol **Lapisan ➔ Tambah Lapisan**.
2. **Saat Berada di Dalam Kawasan Hutan (Blank Spot)**:
   - Nyalakan GPS HP dengan mode *High Accuracy / Lokasi Akurat*.
   - Peta satelit dan KML akan langsung tampil tanpa perlu sinyal internet.
   - Gunakan fitur **Tracking** untuk merekam jalur jelajah dan **Meteran Luas** jika perlu mengestimasi luas pembukaan lahan seketika.
