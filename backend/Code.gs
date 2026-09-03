/**
 * ============================================================================
 * BACKEND PORTAL DOKUMENTASI BPKH WILAYAH XI
 * Google Apps Script — dipasang di akun Google pemilik Drive master.
 *
 * Tugasnya:
 *   1. Menerima foto dari aplikasi, menyimpan ke subfolder Drive per room
 *   2. Mencatat metadata ke Google Spreadsheet (basis data rekap)
 *   3. Mengelola room + token undangan (hanya admin yang boleh membuat)
 *   4. Memeriksa identitas Google petugas dan mengelola daftar anggota room
 * ============================================================================
 */

const KONFIG = {
  ID_FOLDER_MASTER: '1c9p-VDSYLzAPeZgcSI99negl2PiEmP72',
  TOKEN_ADMIN: 'bpkhXI-muecTDPyd5s5oO4st1ub',
  ALAMAT_APLIKASI: 'https://dokumentasi-bpkhxi.netlify.app',

  // Identitas aplikasi di Google Cloud — dipakai memeriksa keaslian login.
  CLIENT_ID: '40977446964-7tep8466rpjlhod7dqm3vbondlg9ejt4.apps.googleusercontent.com',

  // Kalau kantor sudah memakai domain Workspace sendiri, isi di sini
  // (contoh: 'bpkh11.go.id'). Email berdomain itu diterima tanpa undangan.
  DOMAIN_KANTOR: '',

  // Admin TETAP — tidak bisa dicabut dari panel, hanya dari berkas ini.
  // Ini pengaman supaya panel tidak pernah kehilangan seluruh adminnya.
  // Admin tambahan dikelola lewat panel dan tersimpan di ScriptProperties,
  // jadi menambah admin baru tidak perlu menerbitkan versi backend lagi.
  ADMIN_EMAIL: ['ppkhxi@gmail.com'],

  // false = foto tanpa login masih diterima (masa peralihan).
  // Ubah ke true setelah semua petugas terbukti bisa login.
  WAJIB_LOGIN: false,

  // Sesi milik sistem sendiri, bukan token Google. Sengaja panjang supaya
  // foto yang dipotret offline tetap bisa terkirim berhari-hari kemudian.
  MASA_SESI_HARI: 90,

  ZONA_WAKTU: 'Asia/Jakarta',
  VERSI: '2.3.0',
  MAKS_KB: 3000
};

const KOLOM = ['ID', 'Waktu Ambil', 'Waktu Diterima', 'Nama Petugas', 'Room',
  'Latitude', 'Longitude', 'Akurasi (m)', 'Catatan', 'Nama Berkas',
  'Link Drive', 'Ukuran (KB)', 'Email Petugas'];

const KOLOM_ANGGOTA = ['Room', 'Email', 'Nama', 'Bergabung', 'Status'];

// ============ TITIK MASUK ==================================================

function doGet(e) {
  const aksi = (e && e.parameter && e.parameter.aksi) || '';
  if (aksi === 'ping') return balas({ ok: true, versi: KONFIG.VERSI, waktu: new Date().toISOString() });
  return HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui;padding:40px;max-width:520px;margin:auto;line-height:1.6">' +
    '<h2 style="color:#1B5E20">Backend Portal Dokumentasi BPKH Wilayah XI</h2>' +
    '<p>Layanan berjalan normal (versi ' + KONFIG.VERSI + ').</p>' +
    '<p style="color:#666;font-size:14px">Halaman ini bukan aplikasinya. Aplikasi untuk petugas ' +
    'ada di alamat terpisah; alamat ini hanya dipakai aplikasi untuk mengirim data.</p></div>'
  );
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return balas({ ok: false, pesan: 'Permintaan kosong' });
    const p = JSON.parse(e.postData.contents);
    const aksi = p.aksi || '';
    switch (aksi) {
      case 'ping':          return balas({ ok: true, versi: KONFIG.VERSI, wajibLogin: KONFIG.WAJIB_LOGIN });
      case 'cekRoom':       return balas(cekRoom(p));
      case 'masuk':         return balas(masuk(p));
      case 'roomSaya':      return balas(roomSaya(p));
      case 'unggah':        return balas(unggah(p));
      case 'rekap':         return balas(rekap(p));
      case 'adminMasuk':    return balas(adminMasuk(p));
      case 'buatRoom':      return balas(buatRoom(p));
      case 'daftarRoom':    return balas(daftarRoom(p));
      case 'ubahRoom':      return balas(ubahRoom(p));
      case 'daftarAnggota': return balas(daftarAnggota(p));
      case 'ubahAnggota':   return balas(ubahAnggota(p));
      case 'rekapAdmin':    return balas(rekapAdmin(p));
      case 'daftarAdmin':   return balas(daftarAdmin(p));
      case 'ubahAdmin':     return balas(ubahAdmin(p));
      default:              return balas({ ok: false, pesan: 'Aksi tidak dikenal: ' + aksi });
    }
  } catch (err) {
    return balas({ ok: false, pesan: 'Kesalahan server: ' + err.message });
  }
}

function balas(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============ ROOM =========================================================

function bacaRoom() {
  const isi = PropertiesService.getScriptProperties().getProperty('ROOMS');
  return isi ? JSON.parse(isi) : [];
}

function tulisRoom(daftar) {
  PropertiesService.getScriptProperties().setProperty('ROOMS', JSON.stringify(daftar));
}

function cariRoom(nama) {
  return bacaRoom().filter(function (r) { return r.nama === nama; })[0] || null;
}

function wajibRoomSah(p) {
  const r = cariRoom(p.room);
  if (!r) throw new Error('Room "' + p.room + '" tidak terdaftar');
  if (!r.aktif) throw new Error('Room "' + p.room + '" sudah dinonaktifkan admin');
  if (r.token !== p.token) throw new Error('Token undangan tidak cocok. Minta link baru ke admin.');
  return r;
}

function cekRoom(p) {
  try {
    const r = wajibRoomSah(p);
    return { ok: true, room: r.nama, folderId: r.folderId, wajibLogin: KONFIG.WAJIB_LOGIN };
  } catch (err) {
    return { ok: false, pesan: err.message };
  }
}

/* Daftar admin = yang dikunci di KONFIG.ADMIN_EMAIL (tetap) ditambah yang
 * dikelola lewat panel (tersimpan di ScriptProperties). Yang tetap sengaja
 * tidak bisa dicabut dari panel supaya tidak ada keadaan tanpa admin. */
function bacaAdminTambahan() {
  const isi = PropertiesService.getScriptProperties().getProperty('ADMIN_EXTRA');
  return isi ? JSON.parse(isi) : [];
}

function tulisAdminTambahan(daftar) {
  PropertiesService.getScriptProperties().setProperty('ADMIN_EXTRA', JSON.stringify(daftar));
}

function adminTetap() {
  return (KONFIG.ADMIN_EMAIL || []).map(function (x) { return String(x).toLowerCase(); });
}

function semuaAdmin() {
  const tetap = adminTetap();
  const tambahan = bacaAdminTambahan().map(function (a) { return String(a.email).toLowerCase(); });
  return tetap.concat(tambahan.filter(function (e) { return tetap.indexOf(e) < 0; }));
}

function adalahAdmin(email) {
  return semuaAdmin().indexOf(String(email || '').toLowerCase()) >= 0;
}

/* Email admin yang sedang memakai panel. Kosong kalau masuk lewat token,
 * karena token tidak mewakili orang tertentu. */
function siapaAdmin(p) {
  if (p.sesiAdmin) { try { return String(bacaSesi(p.sesiAdmin).e).toLowerCase(); } catch (e) {} }
  return '';
}

/* Dua jalan masuk admin:
   1. Sesi admin — diterbitkan saat email yang terdaftar di ADMIN_EMAIL login
      lewat Google. Dipakai tombol Panel Admin di dalam aplikasi.
   2. Token admin — jalan darurat lewat komputer, tetap dipertahankan supaya
      panel tetap bisa dibuka walau login Google sedang bermasalah. */
function wajibAdmin(p) {
  if (p.sesiAdmin) {
    const s = bacaSesi(p.sesiAdmin);           // melempar sendiri kalau tidak sah
    if (!s.a) throw new Error('Akun ini bukan admin');
    if (!adalahAdmin(s.e)) throw new Error('Akun ini sudah dicabut haknya sebagai admin');
    return;
  }
  if (p.tokenAdmin !== KONFIG.TOKEN_ADMIN) throw new Error('Token admin salah');
}

function adminMasuk(p) {
  try {
    wajibAdmin(p);
    let sebagai = 'token admin';
    if (p.sesiAdmin) { try { sebagai = bacaSesi(p.sesiAdmin).e; } catch (e) {} }
    return { ok: true, versi: KONFIG.VERSI, folderMaster: KONFIG.ID_FOLDER_MASTER,
             alamatAplikasi: KONFIG.ALAMAT_APLIKASI, wajibLogin: KONFIG.WAJIB_LOGIN,
             domainKantor: KONFIG.DOMAIN_KANTOR, sebagai: sebagai,
             adminEmail: semuaAdmin() };
  } catch (err) {
    return { ok: false, pesan: err.message };
  }
}

function daftarAdmin(p) {
  try {
    wajibAdmin(p);
    return { ok: true, tetap: adminTetap(), tambahan: bacaAdminTambahan(), saya: siapaAdmin(p) };
  } catch (err) {
    return { ok: false, pesan: err.message };
  }
}

/* Menambah admin cukup menulis ke ScriptProperties — tidak perlu menerbitkan
 * versi backend baru. Berbagi folder Drive bersifat pilihan dan diminta
 * secara sadar dari panel, karena itu memberi akses ke seluruh foto. */
function ubahAdmin(p) {
  try {
    wajibAdmin(p);
    const email = String(p.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Alamat email tidak sah');

    const tetap = adminTetap();
    const saya = siapaAdmin(p);
    let daftar = bacaAdminTambahan();

    if (p.perintah === 'tambah') {
      if (tetap.indexOf(email) >= 0) throw new Error(email + ' sudah jadi admin tetap di Code.gs');
      if (daftar.some(function (a) { return String(a.email).toLowerCase() === email; }))
        throw new Error(email + ' sudah terdaftar sebagai admin');
      daftar.push({
        email: email,
        olehSiapa: saya || 'token admin',
        waktu: Utilities.formatDate(new Date(), KONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH:mm:ss')
      });
      tulisAdminTambahan(daftar);
      let catatan = '';
      if (p.bagikanDrive) {
        try {
          DriveApp.getFolderById(KONFIG.ID_FOLDER_MASTER).addViewer(email);
          catatan = 'folder Drive dibagikan sebagai pembaca';
        } catch (e) {
          catatan = 'admin ditambahkan, tetapi folder Drive gagal dibagikan: ' + e.message;
        }
      }
      return { ok: true, email: email, perintah: 'tambah', catatan: catatan };
    }

    if (p.perintah === 'cabut') {
      if (tetap.indexOf(email) >= 0)
        throw new Error('Admin tetap hanya bisa dicabut lewat ADMIN_EMAIL di Code.gs, lalu terbitkan versi baru');
      if (saya && saya === email) throw new Error('Tidak bisa mencabut hak admin diri sendiri');
      const sebelum = daftar.length;
      daftar = daftar.filter(function (a) { return String(a.email).toLowerCase() !== email; });
      if (daftar.length === sebelum) throw new Error(email + ' tidak ada di daftar admin tambahan');
      tulisAdminTambahan(daftar);
      let catatan = '';
      try {
        DriveApp.getFolderById(KONFIG.ID_FOLDER_MASTER).removeViewer(email);
        catatan = 'akses folder Drive ikut dicabut';
      } catch (e) {}
      return { ok: true, email: email, perintah: 'cabut', catatan: catatan };
    }

    throw new Error('Perintah tidak dikenal: ' + p.perintah);
  } catch (err) {
    return { ok: false, pesan: err.message };
  }
}

function buatRoom(p) {
  const kunci = LockService.getScriptLock();
  try {
    wajibAdmin(p);
    const nama = String(p.nama || '').trim();
    if (!nama) throw new Error('Nama room tidak boleh kosong');
    if (nama.length > 60) throw new Error('Nama room terlalu panjang (maks 60 karakter)');

    kunci.waitLock(20000);
    if (cariRoom(nama)) throw new Error('Room "' + nama + '" sudah ada');

    const induk = DriveApp.getFolderById(KONFIG.ID_FOLDER_MASTER);
    const cari = induk.getFoldersByName(nama);
    const folder = cari.hasNext() ? cari.next() : induk.createFolder(nama);

    const room = {
      nama: nama,
      folderId: folder.getId(),
      token: Utilities.getUuid().replace(/-/g, '').substring(0, 20),
      dibuat: new Date().toISOString(),
      aktif: true
    };
    const daftar = bacaRoom();
    daftar.push(room);
    tulisRoom(daftar);

    return { ok: true, room: lengkapiLink(room) };
  } catch (err) {
    return { ok: false, pesan: err.message };
  } finally {
    try { kunci.releaseLock(); } catch (x) {}
  }
}

function lengkapiLink(r) {
  return {
    nama: r.nama, folderId: r.folderId, token: r.token, dibuat: r.dibuat, aktif: r.aktif,
    linkUndangan: KONFIG.ALAMAT_APLIKASI + '/?room=' + encodeURIComponent(r.nama) + '&token=' + r.token,
    linkFolder: 'https://drive.google.com/drive/folders/' + r.folderId
  };
}

function daftarRoom(p) {
  try {
    wajibAdmin(p);
    const anggota = bacaAnggota();
    return { ok: true, rooms: bacaRoom().map(function (r) {
      const info = lengkapiLink(r);
      info.jumlahAnggota = anggota.filter(function (a) {
        return a.room === r.nama && a.status === 'aktif';
      }).length;
      return info;
    }) };
  } catch (err) {
    return { ok: false, pesan: err.message };
  }
}

function ubahRoom(p) {
  try {
    wajibAdmin(p);
    const daftar = bacaRoom();
    const r = daftar.filter(function (x) { return x.nama === p.nama; })[0];
    if (!r) throw new Error('Room tidak ditemukan');

    if (p.perintah === 'nonaktifkan') r.aktif = false;
    else if (p.perintah === 'aktifkan') r.aktif = true;
    else if (p.perintah === 'tokenBaru') r.token = Utilities.getUuid().replace(/-/g, '').substring(0, 20);
    else throw new Error('Perintah tidak dikenal');

    tulisRoom(daftar);
    return { ok: true, room: lengkapiLink(r) };
  } catch (err) {
    return { ok: false, pesan: err.message };
  }
}

// ============ IDENTITAS GOOGLE =============================================

/** Memeriksa keaslian tanda pengenal Google ke server Google langsung. */
function verifikasiGoogle(idToken) {
  if (!idToken) throw new Error('Tanda pengenal Google kosong');
  let jawab;
  try {
    jawab = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
  } catch (e) {
    throw new Error('Tidak bisa menghubungi Google untuk memeriksa login');
  }
  if (jawab.getResponseCode() !== 200) throw new Error('Login Google tidak sah atau sudah kedaluwarsa');

  const d = JSON.parse(jawab.getContentText());
  if (d.aud !== KONFIG.CLIENT_ID) throw new Error('Login berasal dari aplikasi lain');
  if (String(d.email_verified) !== 'true') throw new Error('Email Google belum terverifikasi');
  if (Number(d.exp) * 1000 < Date.now()) throw new Error('Login Google sudah kedaluwarsa');

  return { email: String(d.email).toLowerCase(), nama: d.name || d.email };
}

/* Sesi diterbitkan sistem sendiri, bukan token Google. Alasannya: token Google
   hanya berlaku 1 jam, sementara foto lapangan bisa baru terkirim berhari-hari
   kemudian. Sesi ini bertanda tangan HMAC, jadi tidak bisa dipalsukan. */
function kunciSesi() {
  const props = PropertiesService.getScriptProperties();
  let k = props.getProperty('SESI_KUNCI');
  if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SESI_KUNCI', k); }
  return k;
}

function b64u(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function buatSesi(email, nama, room) {
  const isi = JSON.stringify({ e: email, n: nama, r: room,
                               a: adalahAdmin(email) ? 1 : 0,
                               x: Date.now() + KONFIG.MASA_SESI_HARI * 86400000 });
  const bagianIsi = b64u(Utilities.newBlob(isi).getBytes());
  const tanda = b64u(Utilities.computeHmacSha256Signature(bagianIsi, kunciSesi()));
  return bagianIsi + '.' + tanda;
}

function bacaSesi(sesi) {
  if (!sesi || sesi.indexOf('.') < 0) throw new Error('Sesi tidak sah — silakan masuk ulang');
  const bagian = sesi.split('.');
  const tanda = b64u(Utilities.computeHmacSha256Signature(bagian[0], kunciSesi()));
  if (tanda !== bagian[1]) throw new Error('Sesi tidak sah — silakan masuk ulang');
  const isi = JSON.parse(
    Utilities.newBlob(Utilities.base64DecodeWebSafe(bagian[0])).getDataAsString());
  if (Date.now() > isi.x) throw new Error('Sesi kedaluwarsa — silakan masuk ulang');
  return isi;
}

// ============ ANGGOTA ROOM =================================================

function bukaSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('ID_SHEET');
  let ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { id = null; }
  }
  if (!id) {
    ss = SpreadsheetApp.create('Rekap Dokumentasi BPKH XI');
    props.setProperty('ID_SHEET', ss.getId());
    try {
      const berkas = DriveApp.getFileById(ss.getId());
      DriveApp.getFolderById(KONFIG.ID_FOLDER_MASTER).addFile(berkas);
      DriveApp.getRootFolder().removeFile(berkas);
    } catch (e) {}
  }
  ss.setSpreadsheetTimeZone(KONFIG.ZONA_WAKTU);
  return ss;
}

function bukaLembar(nama, kolom) {
  const ss = bukaSpreadsheet();
  let sh = ss.getSheetByName(nama);
  if (!sh) {
    sh = ss.insertSheet(nama);
    sh.appendRow(kolom);
    sh.getRange(1, 1, 1, kolom.length).setFontWeight('bold').setBackground('#E8F5E9');
    sh.setFrozenRows(1);
    const bawaan = ss.getSheetByName('Sheet1');
    if (bawaan) ss.deleteSheet(bawaan);
  }
  return sh;
}

function bukaSheet()        { return bukaLembar('Data', KOLOM); }
function bukaSheetAnggota() { return bukaLembar('Anggota', KOLOM_ANGGOTA); }

function bacaAnggota() {
  const sh = bukaSheetAnggota();
  const jml = sh.getLastRow();
  if (jml < 2) return [];
  return sh.getRange(2, 1, jml - 1, KOLOM_ANGGOTA.length).getValues().map(function (b, i) {
    return { baris: i + 2, room: b[0], email: String(b[1]).toLowerCase(),
             nama: b[2], bergabung: String(b[3]), status: b[4] || 'aktif' };
  });
}

function cariAnggota(room, email) {
  const e = String(email).toLowerCase();
  return bacaAnggota().filter(function (a) { return a.room === room && a.email === e; })[0] || null;
}

/** Berdomain kantor otomatis diterima tanpa perlu terdaftar satu per satu. */
function berdomainKantor(email) {
  const d = String(KONFIG.DOMAIN_KANTOR || '').trim().toLowerCase();
  if (!d) return false;
  return String(email).toLowerCase().slice(-(d.length + 1)) === '@' + d;
}

/* Pendaftaran mandiri: siapa pun yang membuka link undangan dan login langsung
   tercatat sebagai anggota. Admin memantau daftarnya dan bisa mengeluarkan. */
function masuk(p) {
  const kunci = LockService.getScriptLock();
  try {
    const room = wajibRoomSah(p);
    const org = verifikasiGoogle(p.idToken);

    kunci.waitLock(20000);
    let a = cariAnggota(room.nama, org.email);
    if (a && a.status === 'nonaktif' && !berdomainKantor(org.email))
      throw new Error('Akses Anda ke room ini sudah dicabut admin');

    if (!a) {
      bukaSheetAnggota().appendRow([
        room.nama, org.email, org.nama,
        Utilities.formatDate(new Date(), KONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH:mm:ss'),
        'aktif'
      ]);
    } else if (a.nama !== org.nama) {
      bukaSheetAnggota().getRange(a.baris, 3).setValue(org.nama);   // nama Google berubah
    }

    return { ok: true, email: org.email, nama: org.nama, room: room.nama,
             sesi: buatSesi(org.email, org.nama, room.nama),
             admin: adalahAdmin(org.email),
             masaHari: KONFIG.MASA_SESI_HARI };
  } catch (err) {
    return { ok: false, pesan: err.message };
  } finally {
    try { kunci.releaseLock(); } catch (x) {}
  }
}

/* Daftar room milik petugas yang sedang masuk. Dipakai aplikasi untuk mengisi
   pemilih room, supaya petugas yang tergabung di beberapa room bisa berpindah
   tanpa harus membuka link undangan satu per satu di tiap HP.
   Token ikut dikirim karena petugas memang sudah berhak atas room tersebut —
   tanpa token, foto tidak bisa diunggah ke room itu. */
function roomSaya(p) {
  try {
    const s = bacaSesi(p.sesi);
    const email = String(s.e).toLowerCase();
    const milik = bacaAnggota().filter(function (a) {
      return a.email === email && a.status === 'aktif';
    }).map(function (a) { return a.room; });

    const rooms = bacaRoom().filter(function (r) {
      return r.aktif && milik.indexOf(r.nama) >= 0;
    }).map(function (r) {
      return { nama: r.nama, token: r.token, folderId: r.folderId };
    });

    return { ok: true, email: email, rooms: rooms };
  } catch (err) {
    return { ok: false, pesan: err.message };
  }
}

function daftarAnggota(p) {
  try {
    wajibAdmin(p);
    const saring = p.room || '';
    return { ok: true, anggota: bacaAnggota().filter(function (a) {
      return !saring || a.room === saring;
    }) };
  } catch (err) {
    return { ok: false, pesan: err.message };
  }
}

function ubahAnggota(p) {
  try {
    wajibAdmin(p);
    const a = cariAnggota(p.room, p.email);
    if (!a) throw new Error('Anggota tidak ditemukan');
    const status = p.perintah === 'keluarkan' ? 'nonaktif'
                 : p.perintah === 'aktifkan'  ? 'aktif'
                 : null;
    if (!status) throw new Error('Perintah tidak dikenal');
    bukaSheetAnggota().getRange(a.baris, 5).setValue(status);
    return { ok: true, email: a.email, status: status };
  } catch (err) {
    return { ok: false, pesan: err.message };
  }
}

// ============ UNGGAH FOTO ==================================================

function unggah(p) {
  const kunci = LockService.getScriptLock();
  try {
    const room = wajibRoomSah(p);

    // Identitas petugas: dari sesi kalau ada, kalau tidak dari nama ketikan
    // (masa peralihan sebelum WAJIB_LOGIN dinyalakan).
    let namaPetugas = String(p.nama || 'Tanpa Nama');
    let emailPetugas = '';
    if (p.sesi) {
      const s = bacaSesi(p.sesi);
      namaPetugas = s.n;
      emailPetugas = s.e;
      const a = cariAnggota(room.nama, emailPetugas);
      if (a && a.status === 'nonaktif' && !berdomainKantor(emailPetugas))
        throw new Error('Akses Anda ke room ini sudah dicabut admin');
    } else if (KONFIG.WAJIB_LOGIN) {
      throw new Error('Perlu masuk dengan akun Google sebelum mengirim foto');
    }

    if (!p.berkas) throw new Error('Data gambar kosong');
    const catatan = String(p.catatan || '').trim();

    const bytes = Utilities.base64Decode(p.berkas);
    const kb = Math.round(bytes.length / 1024);
    if (kb > KONFIG.MAKS_KB) throw new Error('Berkas terlalu besar (' + kb + ' KB, batas ' + KONFIG.MAKS_KB + ' KB)');

    const waktuAmbil = p.waktu ? new Date(p.waktu) : new Date();
    const cap = Utilities.formatDate(waktuAmbil, KONFIG.ZONA_WAKTU, 'yyyyMMdd_HHmmss');
    const petugas = namaPetugas.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    const namaBerkas = 'DOK_' + room.nama.replace(/[^\w-]/g, '_') + '_' + cap + '_' + petugas + '.jpg';

    const idFoto = String(p.id || cap + '_' + petugas);
    const sh = bukaSheet();
    const sudahAda = cariBarisById(sh, idFoto);
    if (sudahAda) {
      return { ok: true, duplikat: true, id: idFoto, linkDrive: sudahAda.link,
               pesan: 'Foto ini sudah pernah diterima' };
    }

    const blob = Utilities.newBlob(bytes, p.mime || 'image/jpeg', namaBerkas);
    const berkas = DriveApp.getFolderById(room.folderId).createFile(blob);
    berkas.setDescription(
      'Petugas: ' + namaPetugas + (emailPetugas ? ' <' + emailPetugas + '>' : '') +
      '\nRoom: ' + room.nama +
      '\nKoordinat: ' + (p.lat != null ? p.lat + ', ' + p.lon : 'tidak tersedia') +
      '\nCatatan: ' + (catatan || '(tanpa catatan)')
    );

    kunci.waitLock(20000);
    sh.appendRow([
      idFoto,
      Utilities.formatDate(waktuAmbil, KONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH:mm:ss'),
      Utilities.formatDate(new Date(), KONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH:mm:ss'),
      namaPetugas, room.nama,
      p.lat != null ? p.lat : '', p.lon != null ? p.lon : '', p.akurasi != null ? p.akurasi : '',
      catatan, namaBerkas, berkas.getUrl(), kb, emailPetugas
    ]);

    return { ok: true, id: idFoto, linkDrive: berkas.getUrl(), namaBerkas: namaBerkas, ukuranKB: kb };
  } catch (err) {
    return { ok: false, pesan: err.message };
  } finally {
    try { kunci.releaseLock(); } catch (x) {}
  }
}

function cariBarisById(sh, id) {
  const jml = sh.getLastRow();
  if (jml < 2) return null;
  const nilai = sh.getRange(2, 1, jml - 1, KOLOM.length).getValues();
  for (var i = 0; i < nilai.length; i++) {
    if (String(nilai[i][0]) === String(id)) return { baris: i + 2, link: nilai[i][10] };
  }
  return null;
}

// ============ REKAP ========================================================

function rekap(p) {
  try {
    const room = wajibRoomSah(p);
    return { ok: true, data: bacaData(function (b) { return b[4] === room.nama; }) };
  } catch (err) {
    return { ok: false, pesan: err.message };
  }
}

function rekapAdmin(p) {
  try {
    wajibAdmin(p);
    const filterRoom = p.room || '';
    return { ok: true, data: bacaData(function (b) { return !filterRoom || b[4] === filterRoom; }) };
  } catch (err) {
    return { ok: false, pesan: err.message };
  }
}

function bacaData(saring) {
  const sh = bukaSheet();
  const jml = sh.getLastRow();
  if (jml < 2) return [];
  return sh.getRange(2, 1, jml - 1, KOLOM.length).getValues()
    .filter(saring)
    .map(function (b) {
      return {
        id: b[0], waktu: String(b[1]), diterima: String(b[2]), nama: b[3], room: b[4],
        lat: b[5] === '' ? null : Number(b[5]), lon: b[6] === '' ? null : Number(b[6]),
        akurasi: b[7] === '' ? null : Number(b[7]), catatan: b[8],
        namaBerkas: b[9], linkDrive: b[10], ukuranKB: Number(b[11] || 0),
        email: b[12] || ''
      };
    })
    .reverse();
}

// ============ ALAT BANTU (dijalankan manual dari editor) ===================

function ujiPengaturan() {
  const hasil = [];
  try {
    const f = DriveApp.getFolderById(KONFIG.ID_FOLDER_MASTER);
    hasil.push('OK - Folder master ditemukan: "' + f.getName() + '"');
  } catch (e) {
    hasil.push('GAGAL - ID_FOLDER_MASTER salah atau tidak punya akses: ' + e.message);
  }
  hasil.push('OK - TOKEN_ADMIN terisi (' + KONFIG.TOKEN_ADMIN.length + ' karakter)');
  hasil.push('OK - ALAMAT_APLIKASI: ' + KONFIG.ALAMAT_APLIKASI);
  hasil.push(KONFIG.CLIENT_ID.indexOf('.apps.googleusercontent.com') > 0
    ? 'OK - CLIENT_ID terpasang'
    : 'GAGAL - CLIENT_ID belum benar');
  hasil.push('Login diwajibkan: ' + (KONFIG.WAJIB_LOGIN ? 'YA' : 'belum (masa peralihan)'));
  hasil.push('Domain kantor: ' + (KONFIG.DOMAIN_KANTOR || 'belum dipakai'));
  hasil.push('Admin tetap (dari Code.gs): ' + (adminTetap().join(', ') || 'belum ada'));
  const adminPanel = bacaAdminTambahan().map(function (a) { return a.email; });
  hasil.push('Admin dari panel: ' + (adminPanel.join(', ') || 'belum ada'));
  try {
    const sh = bukaSheet();
    bukaSheetAnggota();
    hasil.push('OK - Spreadsheet siap: ' + sh.getParent().getUrl());
  } catch (e) {
    hasil.push('GAGAL - Spreadsheet tidak bisa dibuat: ' + e.message);
  }
  const r = bacaRoom();
  hasil.push('Room terdaftar: ' + (r.length ? r.map(function (x) { return x.nama; }).join(', ') : 'belum ada'));
  hasil.push('Anggota terdaftar: ' + bacaAnggota().length + ' orang');
  Logger.log(hasil.join('\n'));
  return hasil.join('\n');
}

function buatRoomManual() {
  const NAMA_ROOM = 'PPTPKH KEDIRI';
  const hasil = buatRoom({ tokenAdmin: KONFIG.TOKEN_ADMIN, nama: NAMA_ROOM });
  Logger.log(JSON.stringify(hasil, null, 2));
  return hasil;
}
