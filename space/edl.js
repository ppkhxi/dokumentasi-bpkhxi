/* ===========================================================================
   DKPOINT — EDL (Edit Decision List) untuk Studio Video

   Kontrak ini sengaja kecil dan stabil agar agen AI tidak perlu menyentuh
   berkas video. Agen hanya memilih klip yang sudah ada, menentukan masuk/
   keluar, dan menulis caption. Studio Video yang memutar pratinjau dan
   merender dengan ffmpeg.

   Versi 1:
     versi       : "dkpoint-edl/1"
     keluaran    : { rasio, judul?, penutup? }
     urutan[]    : { id?, klip: { id, nama?, room?, petugas?, durasi?, ts? },
                     masuk, keluar, teks?, posisiTeks?, warnaTeks?, alasan? }
     catatan?    : string

   Waktu masuk/keluar adalah detik di dalam klip sumber, bukan waktu timeline.
   ========================================================================== */
(function () {
  'use strict';

  const VERSI = 'dkpoint-edl/1';
  const RASIO = ['16:9', '9:16', '1:1', '4:5'];
  const POSISI = ['atas', 'tengah', 'bawah'];
  const MAKS_KLIP = 30;
  const MAKS_TEKS = 90;
  const MAKS_JUDUL = 80;
  const POLA_WARNA = /^#[0-9a-fA-F]{6}$/;

  const bersih = v => (typeof v === 'string' ? v.trim() : '');
  const bulat = v => Math.round((Number(v) || 0) * 1000) / 1000;

  function angkaValid(v) {
    return typeof v === 'number' && isFinite(v);
  }

  /* Validasi + normalisasi. Tidak pernah mengubah objek masukan. */
  function validasi(masukan) {
    const galat = [];
    const tolak = (path, pesan) => galat.push({ path, pesan });

    if (!masukan || typeof masukan !== 'object' || Array.isArray(masukan)) {
      return { ok: false, galat: [{ path: '', pesan: 'EDL harus berupa objek JSON.' }], edl: null };
    }

    if (masukan.versi !== VERSI) {
      tolak('versi', 'versi harus "' + VERSI + '".');
    }

    const keluaran = { rasio: '16:9', judul: '', penutup: '' };
    const kel = masukan.keluaran;
    if (!kel || typeof kel !== 'object' || Array.isArray(kel)) {
      tolak('keluaran', 'keluaran wajib berupa objek.');
    } else {
      if (kel.rasio === undefined) tolak('keluaran.rasio', 'rasio wajib diisi.');
      else if (!RASIO.includes(kel.rasio)) tolak('keluaran.rasio', 'rasio harus salah satu: ' + RASIO.join(', ') + '.');
      else keluaran.rasio = kel.rasio;

      ['judul', 'penutup'].forEach(kunci => {
        const nilai = kel[kunci];
        if (nilai === undefined || nilai === null) return;
        if (typeof nilai !== 'string') { tolak('keluaran.' + kunci, kunci + ' harus berupa teks.'); return; }
        if (nilai.trim().length > MAKS_JUDUL) { tolak('keluaran.' + kunci, kunci + ' maksimal ' + MAKS_JUDUL + ' karakter.'); return; }
        keluaran[kunci] = nilai.trim();
      });
    }

    const urutan = [];
    if (!Array.isArray(masukan.urutan)) {
      tolak('urutan', 'urutan wajib berupa array.');
    } else {
      if (!masukan.urutan.length) tolak('urutan', 'urutan minimal berisi satu adegan.');
      if (masukan.urutan.length > MAKS_KLIP) tolak('urutan', 'urutan maksimal ' + MAKS_KLIP + ' adegan.');
      const idAdegan = new Set();

      masukan.urutan.forEach((adegan, i) => {
        const path = 'urutan[' + i + ']';
        if (!adegan || typeof adegan !== 'object' || Array.isArray(adegan)) {
          tolak(path, 'adegan harus berupa objek.');
          return;
        }

        let id = adegan.id === undefined || adegan.id === null ? 'sc-' + (i + 1) : bersih(adegan.id);
        if (!id) { tolak(path + '.id', 'id adegan tidak boleh kosong.'); id = 'sc-' + (i + 1); }
        if (id.length > 80) tolak(path + '.id', 'id adegan maksimal 80 karakter.');
        if (idAdegan.has(id)) tolak(path + '.id', 'id adegan "' + id + '" dipakai lebih dari sekali.');
        idAdegan.add(id);

        const klipMasuk = adegan.klip;
        const klip = { id: '' };
        if (!klipMasuk || typeof klipMasuk !== 'object' || Array.isArray(klipMasuk)) {
          tolak(path + '.klip', 'klip wajib berupa objek.');
        } else {
          if (typeof klipMasuk.id !== 'string' || !klipMasuk.id.trim()) {
            tolak(path + '.klip.id', 'klip.id wajib diisi dengan ID dari StudioVideo.edl.katalog().');
          } else if (klipMasuk.id.trim().length > 300) {
            tolak(path + '.klip.id', 'klip.id maksimal 300 karakter.');
          } else {
            klip.id = klipMasuk.id.trim();
          }

          ['nama', 'room', 'petugas'].forEach(kunci => {
            const nilai = klipMasuk[kunci];
            if (nilai === undefined || nilai === null) return;
            if (typeof nilai !== 'string') { tolak(path + '.klip.' + kunci, kunci + ' harus berupa teks.'); return; }
            klip[kunci] = nilai.trim();
          });

          if (klipMasuk.durasi !== undefined && klipMasuk.durasi !== null) {
            if (!angkaValid(klipMasuk.durasi) || klipMasuk.durasi < 0.3) {
              tolak(path + '.klip.durasi', 'klip.durasi harus angka minimal 0,3 detik.');
            } else {
              klip.durasi = bulat(klipMasuk.durasi);
            }
          }

          if (klipMasuk.ts !== undefined && klipMasuk.ts !== null) {
            if (!angkaValid(klipMasuk.ts)) tolak(path + '.klip.ts', 'klip.ts harus angka atau null.');
            else klip.ts = klipMasuk.ts;
          }
        }

        const masukValid = angkaValid(adegan.masuk) && adegan.masuk >= 0;
        const keluarValid = angkaValid(adegan.keluar) && adegan.keluar > 0;
        if (!masukValid) tolak(path + '.masuk', 'masuk harus angka minimal 0.');
        if (!keluarValid) tolak(path + '.keluar', 'keluar harus angka lebih besar dari 0.');

        let masuk = 0, keluar = 0;
        if (masukValid && keluarValid) {
          if (adegan.keluar <= adegan.masuk) {
            tolak(path + '.keluar', 'keluar harus lebih besar dari masuk.');
          } else if (adegan.keluar - adegan.masuk < 0.3) {
            tolak(path, 'durasi adegan minimal 0,3 detik.');
          } else if (klip.durasi && adegan.keluar > klip.durasi + 0.05) {
            tolak(path + '.keluar', 'keluar melewati durasi klip (' + klip.durasi + ' detik).');
          } else {
            masuk = bulat(adegan.masuk);
            keluar = bulat(adegan.keluar);
          }
        }

        let teks = '';
        if (adegan.teks !== undefined && adegan.teks !== null) {
          if (typeof adegan.teks !== 'string') tolak(path + '.teks', 'teks harus berupa string.');
          else if (adegan.teks.trim().length > MAKS_TEKS) tolak(path + '.teks', 'teks maksimal ' + MAKS_TEKS + ' karakter.');
          else teks = adegan.teks.trim();
        }

        let posisiTeks = 'bawah';
        if (adegan.posisiTeks !== undefined && adegan.posisiTeks !== null) {
          if (!POSISI.includes(adegan.posisiTeks)) tolak(path + '.posisiTeks', 'posisiTeks harus salah satu: ' + POSISI.join(', ') + '.');
          else posisiTeks = adegan.posisiTeks;
        }

        let warnaTeks = '#ffffff';
        if (adegan.warnaTeks !== undefined && adegan.warnaTeks !== null) {
          if (typeof adegan.warnaTeks !== 'string' || !POLA_WARNA.test(adegan.warnaTeks)) {
            tolak(path + '.warnaTeks', 'warnaTeks harus format #RRGGBB.');
          } else {
            warnaTeks = adegan.warnaTeks.toLowerCase();
          }
        }

        let alasan = '';
        if (adegan.alasan !== undefined && adegan.alasan !== null) {
          if (typeof adegan.alasan !== 'string') tolak(path + '.alasan', 'alasan harus berupa teks.');
          else if (adegan.alasan.trim().length > 240) tolak(path + '.alasan', 'alasan maksimal 240 karakter.');
          else alasan = adegan.alasan.trim();
        }

        urutan.push({
          id, klip, masuk, keluar, teks, posisiTeks, warnaTeks,
          ...(alasan ? { alasan } : {})
        });
      });
    }

    let sumber = '';
    if (masukan.sumber !== undefined && masukan.sumber !== null) {
      if (typeof masukan.sumber !== 'string') tolak('sumber', 'sumber harus berupa teks.');
      else if (masukan.sumber.trim().length > 80) tolak('sumber', 'sumber maksimal 80 karakter.');
      else sumber = masukan.sumber.trim();
    }

    let catatan = '';
    if (masukan.catatan !== undefined && masukan.catatan !== null) {
      if (typeof masukan.catatan !== 'string') tolak('catatan', 'catatan harus berupa teks.');
      else if (masukan.catatan.trim().length > 500) tolak('catatan', 'catatan maksimal 500 karakter.');
      else catatan = masukan.catatan.trim();
    }

    let dibuat = new Date().toISOString();
    if (masukan.dibuat !== undefined && masukan.dibuat !== null) {
      if (typeof masukan.dibuat !== 'string' || !masukan.dibuat.trim()) tolak('dibuat', 'dibuat harus berupa teks ISO 8601.');
      else dibuat = masukan.dibuat.trim();
    }

    if (galat.length) return { ok: false, galat, edl: null };

    return {
      ok: true,
      galat: [],
      edl: {
        versi: VERSI,
        dibuat,
        ...(sumber ? { sumber } : {}),
        keluaran,
        urutan,
        ...(catatan ? { catatan } : {})
      }
    };
  }

  /* Contoh untuk agen/dev. ID klip harus diganti dengan hasil katalog(). */
  function contoh() {
    return {
      versi: VERSI,
      dibuat: new Date().toISOString(),
      sumber: 'contoh',
      keluaran: { rasio: '16:9', judul: 'Kegiatan Survei', penutup: 'Dokumentasi BPKH' },
      urutan: [
        {
          id: 'sc-1',
          klip: { id: 'c:ROOM/PETUGAS/klip-1.mp4', nama: 'klip-1.mp4', room: 'ROOM', petugas: 'PETUGAS', durasi: 10 },
          masuk: 0,
          keluar: 4,
          teks: 'Persiapan pengukuran',
          posisiTeks: 'bawah',
          warnaTeks: '#ffffff',
          alasan: 'Klip pembuka memperlihatkan persiapan tim.'
        },
        {
          id: 'sc-2',
          klip: { id: 'c:ROOM/PETUGAS/klip-2.mp4', nama: 'klip-2.mp4', room: 'ROOM', petugas: 'PETUGAS', durasi: 10 },
          masuk: 1.5,
          keluar: 5,
          teks: 'Pemasangan patok',
          posisiTeks: 'bawah',
          warnaTeks: '#ffffff',
          alasan: 'Momen utama kegiatan.'
        }
      ]
    };
  }

  window.EDL = { VERSI, RASIO, POSISI, MAKS_KLIP, validasi, contoh };
})();
