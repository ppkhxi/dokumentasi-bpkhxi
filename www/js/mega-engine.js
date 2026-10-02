/**
 * ============================================================================
 * MEGA ENGINE — dkpoint (Versi Optimal & Aman)
 * Menangani komunikasi antara PWA dan MEGA Cloud:
 *  1. Login & info akun MEGA (kuota, email)
 *  2. Pengelolaan Multi-Room Berbasis Hak Akses Ketat:
 *     - Hanya Host yang bisa Buat Room, Share Link, Hapus Room, dan Tarik Rekap.
 *     - Anggota hanya bisa Gabung, Upload tanpa login, dan Keluar dari Room.
 *  3. Token Undangan Ringkas & Aman (Masking XOR URL-Safe)
 *  4. Session Caching (Upload beruntun cepat tanpa re-login berulang)
 *  5. Timeout & Error Handling Khusus Sinyal Lapangan
 * ============================================================================
 */

(function(window) {
  'use strict';

  const KUNCI_STORAGE = {
    AUTH: 'dkpoint_mega_auth',
    ROOMS: 'dkpoint_mega_rooms',
    ROOM_AKTIF: 'dkpoint_mega_room_aktif'
  };

  const _ls = window.localStorage || (typeof localStorage !== 'undefined' ? localStorage : null);

  const FOLDER_MASTER_NAMA = 'DKPOINT_DOKUMENTASI';
  const APP_SALT = [0x50, 0x50, 0x54, 0x50, 0x4B, 0x48, 0x5F, 0x44, 0x4B, 0x50, 0x31, 0x31]; // 'PPTPKH_DKP11'

  let _storageInstance = null;
  let _sedangLogin = false;
  let _folderMaster = null;

  // Cache sesi upload anggota agar tidak re-login setiap foto
  const _guestStorageMap = new Map();
  const _targetFolderCache = new Map();

  function withTimeout(promise, ms, pesanTimeout) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(pesanTimeout || `Operasi timeout (${Math.round(ms/1000)}s)`)), ms);
    });
    return Promise.race([
      Promise.resolve(promise).then(res => { clearTimeout(timer); return res; }),
      timeoutPromise
    ]);
  }

  function petakanErrorMega(err) {
    const msg = String(err && (err.message || err)).toLowerCase();
    if (msg.includes('etoomany') || msg.includes('-17') || msg.includes('quota') || msg.includes('space')) {
      return 'Penyimpanan MEGA Host penuh (melebihi batas kuota)';
    }
    if (msg.includes('blocked') || msg.includes('-16')) {
      return 'Akun MEGA Host terblokir atau dibatasi sementara oleh MEGA';
    }
    if (msg.includes('enoent') || msg.includes('-9')) {
      return 'Folder room atau akun tidak ditemukan di akun MEGA Host';
    }
    if (msg.includes('csp') || msg.includes('content security policy') || msg.includes('violates')) {
      return 'Koneksi diblokir oleh proteksi keamanan browser (CSP)';
    }
    if (msg.includes('eagain') || msg.includes('-3') || msg.includes('network') || msg.includes('failed to fetch')) {
      return 'Koneksi ke server MEGA terputus atau sinyal tidak stabil';
    }
    if (msg.includes('timeout')) {
      return 'Waktu unggah habis (timeout sinyal lemah)';
    }
    return (err && err.message) ? err.message : 'Gagal mengunggah foto ke Cloud MEGA';
  }

  function xorMask(str) {
    const utf8 = unescape(encodeURIComponent(str));
    let res = '';
    for (let i = 0; i < utf8.length; i++) {
      res += String.fromCharCode(utf8.charCodeAt(i) ^ APP_SALT[i % APP_SALT.length]);
    }
    return btoa(res).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function xorUnmask(str) {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const raw = atob(b64);
    let res = '';
    for (let i = 0; i < raw.length; i++) {
      res += String.fromCharCode(raw.charCodeAt(i) ^ APP_SALT[i % APP_SALT.length]);
    }
    return decodeURIComponent(escape(res));
  }

  function bongkarTiket(raw) {
    if (!raw) throw new Error('Data undangan kosong');
    if (typeof raw === 'object') return raw;
    raw = String(raw).trim();
    if (raw.startsWith('DKP-')) {
      raw = raw.slice(4);
    }

    // 1. Coba decode format aman baru (xorMask)
    try {
      const unmasked = xorUnmask(raw);
      const data = JSON.parse(unmasked);
      if (data && (data.n || data.e)) return data;
    } catch(e) {}

    // 2. Fallback decode format base64 lama (kompatibilitas mundur)
    try {
      const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
      const data = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (data && (data.n || data.e || data.tk)) return data;
    } catch(e) {}

    try {
      const data = JSON.parse(decodeURIComponent(atob(raw)));
      if (data && (data.n || data.e || data.tk)) return data;
    } catch(e) {}

    throw new Error('Kode undangan tidak valid atau rusak');
  }

  async function dapatkanStorageHost(authTicket) {
    if (_guestStorageMap.has(authTicket)) {
      const cached = _guestStorageMap.get(authTicket);
      if (cached && cached.status === 'ready') return cached;
      _guestStorageMap.delete(authTicket);
    }
    const kred = bongkarTiket(authTicket);
    const email = kred.e || kred.email;
    const password = kred.p || kred.password;
    if (!email || !password) throw new Error('Kredensial Host dalam tiket tidak lengkap');

    const storageHost = new mega.Storage({ email, password });
    try {
      await withTimeout(storageHost.ready, 45000, 'Gagal menghubungkan sesi ke akun Host MEGA (timeout koneksi 45s).');
      _guestStorageMap.set(authTicket, storageHost);
      return storageHost;
    } catch (err) {
      _guestStorageMap.delete(authTicket);
      throw new Error(petakanErrorMega(err));
    }
  }

  function simpanKredensial(email, password) {
    try {
      const b = btoa(unescape(encodeURIComponent(JSON.stringify({ email, password, ts: Date.now() }))));
      if (_ls) _ls.setItem(KUNCI_STORAGE.AUTH, b);
    } catch(e) {
      console.error('Gagal menyimpan kredensial:', e);
    }
  }

  function bacaKredensial() {
    try {
      if (!_ls) return null;
      const b = _ls.getItem(KUNCI_STORAGE.AUTH);
      if (!b) return null;
      return JSON.parse(decodeURIComponent(escape(atob(b))));
    } catch(e) {
      return null;
    }
  }

  function hapusKredensial() {
    if (_ls) _ls.removeItem(KUNCI_STORAGE.AUTH);
    _storageInstance = null;
    _folderMaster = null;
    _guestStorageMap.clear();
    _targetFolderCache.clear();
  }

  function dataUrlKeUint8Array(dataUrl) {
    if (!dataUrl) throw new Error('Data gambar kosong atau tidak ditemukan');
    if (dataUrl instanceof Uint8Array) return dataUrl;
    if (typeof dataUrl !== 'string') throw new Error('Format data gambar tidak didukung');
    const bagian = dataUrl.split(',');
    if (bagian.length < 2) throw new Error('Format DataURL gambar tidak valid (tidak ada pemisah base64)');
    const binary = atob(bagian[1]);
    const p = binary.length;
    const bytes = new Uint8Array(p);
    for (let i = 0; i < p; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const MegaEngine = {
    punyaSesi() {
      return !!bacaKredensial();
    },

    getEmail() {
      const k = bacaKredensial();
      return k ? k.email : '';
    },

    async login(email, password) {
      if (typeof mega === 'undefined' || !mega.Storage) {
        throw new Error('Pustaka MEGA belum siap dimuat');
      }

      _sedangLogin = true;
      try {
        const storage = new mega.Storage({ email, password });
        await withTimeout(storage.ready, 30000, 'Gagal login ke MEGA (koneksi timeout).');
        _storageInstance = storage;
        simpanKredensial(email, password);
        return { ok: true, email: storage.email };
      } catch (err) {
        _storageInstance = null;
        throw new Error(petakanErrorMega(err));
      } finally {
        _sedangLogin = false;
      }
    },

    async pastikanTerhubung() {
      if (_storageInstance) return _storageInstance;
      const k = bacaKredensial();
      if (!k) throw new Error('Belum login akun MEGA');
      await this.login(k.email, k.password);
      return _storageInstance;
    },

    async getInfoAkun() {
      await this.pastikanTerhubung();
      if (!_storageInstance) throw new Error('MEGA belum terhubung');

      try {
        const info = await withTimeout(_storageInstance.getAccountInfo(), 15000, 'Gagal mengambil info akun');
        const digunakan = info.spaceUsed || 0;
        const total = info.spaceTotal || (20 * 1024 * 1024 * 1024);
        return {
          email: _storageInstance.email,
          digunakanBytes: digunakan,
          totalBytes: total,
          persen: total > 0 ? ((digunakan / total) * 100).toFixed(1) : '0',
          digunakanMB: (digunakan / (1024 * 1024)).toFixed(1),
          digunakanGB: (digunakan / (1024 * 1024 * 1024)).toFixed(2),
          totalGB: (total / (1024 * 1024 * 1024)).toFixed(0)
        };
      } catch (e) {
        return {
          email: this.getEmail(),
          digunakanGB: '?',
          totalGB: '?',
          persen: '0'
        };
      }
    },

    logout() {
      hapusKredensial();
    },

    async dapatkanFolderMaster(instanceStorage) {
      const st = instanceStorage || _storageInstance;
      if (!st) throw new Error('Storage belum siap');
      if (!instanceStorage && _folderMaster) return _folderMaster;

      const ada = st.find(FOLDER_MASTER_NAMA);
      if (ada) {
        if (!instanceStorage) _folderMaster = ada;
        return ada;
      }
      const baru = await st.mkdir(FOLDER_MASTER_NAMA);
      if (!instanceStorage) _folderMaster = baru;
      return baru;
    },

    // -------------------------------------------------------------
    // PENGELOLAAN ROOM & HAK AKSES
    // -------------------------------------------------------------

    ambilSemuaRoom() {
      try {
        if (!_ls) return [];
        const raw = _ls.getItem(KUNCI_STORAGE.ROOMS);
        return raw ? JSON.parse(raw) : [];
      } catch(e) {
        return [];
      }
    },

    simpanSemuaRoom(rooms) {
      if (_ls) _ls.setItem(KUNCI_STORAGE.ROOMS, JSON.stringify(rooms));
    },

    getRoomAktif() {
      if (!_ls) return null;
      const aktif = _ls.getItem(KUNCI_STORAGE.ROOM_AKTIF);
      const semua = this.ambilSemuaRoom();
      if (aktif) {
        const ada = semua.find(r => r.id === aktif || r.nama === aktif);
        if (ada) return ada;
      }
      return semua.length > 0 ? semua[0] : null;
    },

    setRoomAktif(idAtauNama) {
      if (_ls) _ls.setItem(KUNCI_STORAGE.ROOM_AKTIF, idAtauNama);
    },

    // HANYA Host yang boleh membuat room
    async buatRoom(namaRoom) {
      const bersih = (namaRoom || '').trim().toUpperCase();
      if (!bersih) throw new Error('Nama room tidak boleh kosong');

      await this.pastikanTerhubung();
      const folderMaster = await this.dapatkanFolderMaster();

      let folderRoom = folderMaster.find(bersih);
      if (!folderRoom) {
        folderRoom = await _storageInstance.mkdir({
          name: bersih,
          target: folderMaster
        });
      }

      const idRoom = 'room_' + Date.now();
      const objekRoom = {
        id: idRoom,
        nama: bersih,
        tipe: 'host', // PEMBUAT ROOM
        hostEmail: this.getEmail(),
        dibuat: Date.now()
      };

      const list = this.ambilSemuaRoom().filter(r => (r.nama || '').trim().toUpperCase() !== bersih);
      list.unshift(objekRoom);
      this.simpanSemuaRoom(list);
      this.setRoomAktif(objekRoom.id);

      return objekRoom;
    },

    // Buat kode token undangan ringkas & aman (format DKP-...)
    buatTokenUndangan(namaAtauIdRoom) {
      const target = (namaAtauIdRoom || '').trim().toUpperCase();
      const r = this.ambilSemuaRoom().find(x => (x.nama || '').trim().toUpperCase() === target || x.id === target);
      if (!r) throw new Error('Room tidak ditemukan');

      // Proteksi hak akses: Hanya Host yang berhak membagikan undangan
      if (r.tipe !== 'host') {
        throw new Error('Hanya Pembuat Room (Host) yang memiliki hak membagikan undangan!');
      }

      const kred = bacaKredensial();
      if (!kred) throw new Error('Kredensial Host tidak ditemukan. Login ulang ke MEGA.');

      const payload = {
        n: r.nama,
        e: kred.email,
        p: kred.password
      };
      
      // Masking XOR URL-Safe agar tidak mudah dibuka plain-text
      const token = xorMask(JSON.stringify(payload));
      return 'DKP-' + token;
    },

    // Buat link undangan langsung
    buatLinkUndangan(namaAtauIdRoom) {
      const token = this.buatTokenUndangan(namaAtauIdRoom);
      const base = location.origin + location.pathname;
      return `${base}?undangan=${encodeURIComponent(token)}`;
    },

    // Anggota regu bergabung via kode token atau link undangan
    async gabungRoom(inputUndangan) {
      let raw = (inputUndangan || '').trim();
      if (!raw) throw new Error('Kode atau link undangan tidak boleh kosong');

      if (raw.includes('undangan=')) {
        try {
          const u = new URL(raw);
          raw = u.searchParams.get('undangan') || raw;
        } catch(e) {
          const idx = raw.indexOf('undangan=');
          raw = raw.slice(idx + 9).split('&')[0];
        }
      }

      raw = decodeURIComponent(raw).trim();
      if (raw.startsWith('DKP-')) {
        raw = raw.slice(4);
      }

      const data = bongkarTiket(raw);
      if (!data || !data.n) throw new Error('Format undangan tidak lengkap');

      const namaRoom = String(data.n).trim().toUpperCase();
      let hostEmail = data.e || data.h || '';
      let tiketAuth = raw;

      // Verifikasi awal koneksi ke akun Host
      try {
        await dapatkanStorageHost(tiketAuth);
      } catch(testErr) {
        console.warn('Verifikasi awal akun Host:', testErr);
      }

      const objekRoom = {
        id: 'room_join_' + Date.now(),
        nama: namaRoom,
        tipe: 'member', // ANGGOTA (Bukan Host)
        hostEmail: hostEmail,
        authTicket: tiketAuth,
        dibuat: Date.now()
      };

      const list = this.ambilSemuaRoom().filter(r => (r.nama || '').trim().toUpperCase() !== namaRoom);
      list.unshift(objekRoom);
      this.simpanSemuaRoom(list);
      this.setRoomAktif(objekRoom.id);

      return objekRoom;
    },

    // HANYA Host yang berhak menghapus room; Anggota hanya 'keluar' dari room
    hapusRoom(idAtauNama) {
      let list = this.ambilSemuaRoom();
      const target = list.find(r => r.id === idAtauNama || r.nama === idAtauNama);
      if (!target) return;

      list = list.filter(r => r.id !== idAtauNama && r.nama !== idAtauNama);
      this.simpanSemuaRoom(list);
      const aktif = this.getRoomAktif();
      if (aktif && (aktif.id === idAtauNama || aktif.nama === idAtauNama)) {
        this.setRoomAktif(list.length > 0 ? list[0].id : '');
      }
    },

    // Cek apakah room tertentu memiliki otorisasi upload ke Cloud
    bisaUpload(namaAtauIdRoom) {
      if (this.punyaSesi()) return true;
      const target = (namaAtauIdRoom || '').trim().toUpperCase();
      const list = this.ambilSemuaRoom();
      const r = (target ? list.find(x => (x.nama || '').trim().toUpperCase() === target || x.id === target) : null) || this.getRoomAktif();
      return !!(r && (r.authTicket || r.tipe === 'host'));
    },

    // -------------------------------------------------------------
    // PENGUNGGAHAN FOTO (Mendukung Anggota Tanpa Akun MEGA Sendiri)
    // -------------------------------------------------------------

    async unggahFoto(foto) {
      const namaFotoRoom = (foto.room || '').trim().toUpperCase();
      const listRoom = this.ambilSemuaRoom();
      const roomAktif = listRoom.find(r => (r.nama || '').trim().toUpperCase() === namaFotoRoom || r.id === foto.room) || this.getRoomAktif();
      const namaRoom = (namaFotoRoom || (roomAktif ? roomAktif.nama : 'UMUM')).toUpperCase();

      let storageUntukUpload = null;

      // Kasus 1: Pengguna sudah login akun MEGA sendiri
      if (this.punyaSesi()) {
        await this.pastikanTerhubung();
        storageUntukUpload = _storageInstance;
      } 
      // Kasus 2: Pengguna adalah Anggota yang menggunakan Otorisasi Room Host (Session Cached)
      else if (roomAktif && roomAktif.authTicket) {
        storageUntukUpload = await dapatkanStorageHost(roomAktif.authTicket);
      }

      if (!storageUntukUpload) {
        throw new Error('Belum terhubung ke Cloud. Minta link undangan dari Host atau login akun MEGA di Setelan.');
      }

      // Format nama berkas cerdas: [KODE_ROOM]_[ID_USER]_[NO_URUT]_[LAT]_[LON].jpg
      let namaBerkas = foto.namaBerkas;
      if (!namaBerkas) {
        const idUser = (foto.userId || foto.nama || 'USER').trim().replace(/\s+/g, '_').replace(/[^\w-]/g, '').toUpperCase();
        const noUrutStr = String(foto.noUrut || 1).padStart(3, '0');
        let koordStr = '';
        if (foto.lat != null && foto.lon != null) {
          koordStr = `_${Number(foto.lat).toFixed(5)}_${Number(foto.lon).toFixed(5)}`;
        }
        namaBerkas = `${namaRoom}_${idUser}_${noUrutStr}${koordStr}.jpg`;
      }

      const bytes = dataUrlKeUint8Array(foto.dataUrl);

      // Caching folder room agar tidak re-query setiap foto
      const master = await this.dapatkanFolderMaster(storageUntukUpload);
      let storageCache = _targetFolderCache.get(storageUntukUpload);
      if (!storageCache) {
        storageCache = new Map();
        _targetFolderCache.set(storageUntukUpload, storageCache);
      }

      let targetFolder = storageCache.get(namaRoom);
      if (!targetFolder) {
        targetFolder = master.find(namaRoom);
        if (!targetFolder) {
          targetFolder = await storageUntukUpload.mkdir({ name: namaRoom, target: master });
        }
        if (targetFolder) storageCache.set(namaRoom, targetFolder);
      }

      if (!targetFolder) {
        throw new Error('Gagal menyiapkan folder room di akun MEGA');
      }

      // Upload file ke folder target dengan penanganan error stream langsung
      let uploadAction;
      try {
        uploadAction = targetFolder.upload({
          name: namaBerkas,
          size: bytes.byteLength
        }, bytes);
      } catch (syncErr) {
        throw new Error(petakanErrorMega(syncErr));
      }

      let uploadedFile;
      try {
        const uploadPromise = new Promise((resolve, reject) => {
          uploadAction.on('error', err => reject(err));
          uploadAction.complete.then(resolve).catch(reject);
        });

        uploadedFile = await withTimeout(
          uploadPromise,
          60000,
          'Unggahan foto timeout (60s) — periksa koneksi internet.'
        );
      } catch(upErr) {
        throw new Error(petakanErrorMega(upErr));
      }

      // Link publik instan: nodeId fallback cepat agar antrean tidak tertahan
      let linkPublik = `https://mega.nz/#${(uploadedFile && uploadedFile.nodeId) ? uploadedFile.nodeId : ''}`;
      if (uploadedFile && typeof uploadedFile.link === 'function') {
        try {
          linkPublik = await withTimeout(uploadedFile.link(), 2000, linkPublik);
        } catch(e) {}
      }

      return {
        ok: true,
        namaBerkas: namaBerkas,
        linkDrive: linkPublik,
        ukuran: bytes.byteLength
      };
    },

    // -------------------------------------------------------------
    // FITUR HOST: REKAP TIM & DAFTAR ANGGOTA DARI CLOUD MEGA
    // -------------------------------------------------------------

    // Membaca daftar anggota regu yang sudah menyetorkan foto ke room Host
    async ambilDaftarAnggota(namaRoom) {
      await this.pastikanTerhubung();
      const master = await this.dapatkanFolderMaster();
      const folderRoom = master.find(namaRoom.toUpperCase());
      if (!folderRoom || !folderRoom.children) return [];

      const stats = {};
      folderRoom.children.forEach(file => {
        if (!file.name || !file.name.endsWith('.jpg')) return;
        let namaPetugas = 'Petugas';
        if (file.name.includes('__')) {
          const bagian = file.name.replace(/\.jpg$/i, '').split('__');
          namaPetugas = bagian.length >= 5 ? bagian[4].replace(/_/g, ' ') : (bagian[bagian.length - 1] || 'Petugas');
        } else {
          // Format baru: [ROOM]_[USER]_[NOURUT].jpg
          const bagian = file.name.replace(/\.jpg$/i, '').split('_');
          namaPetugas = bagian.length >= 3 ? bagian.slice(1, bagian.length - 1).join(' ') : (bagian[1] || 'Petugas');
        }
        if (!stats[namaPetugas]) {
          stats[namaPetugas] = { nama: namaPetugas, jumlahFoto: 0, terakhirTs: 0 };
        }
        stats[namaPetugas].jumlahFoto++;
        const ts = file.timestamp ? file.timestamp * 1000 : Date.now();
        if (ts > stats[namaPetugas].terakhirTs) stats[namaPetugas].terakhirTs = ts;
      });

      return Object.values(stats).sort((a, b) => b.jumlahFoto - a.jumlahFoto);
    },

    // Membaca statistik seluruh pengguna/petugas dari seluruh room di folder master MEGA
    async ambilSemuaPengguna() {
      await this.pastikanTerhubung();
      const master = await this.dapatkanFolderMaster();
      if (!master || !master.children) return { totalPengguna: 0, totalFoto: 0, daftar: [] };

      const stats = {};
      let totalFoto = 0;

      master.children.forEach(item => {
        if (!item.children) return;
        const namaRoom = item.name;

        item.children.forEach(file => {
          if (!file.name || !file.name.endsWith('.jpg')) return;
          totalFoto++;
          let namaPetugas = 'Petugas';

          if (file.name.includes('__')) {
            const bagian = file.name.replace(/\.jpg$/i, '').split('__');
            namaPetugas = bagian.length >= 5 ? bagian[4].replace(/_/g, ' ') : (bagian[bagian.length - 1] || 'Petugas');
          } else {
            const bagian = file.name.replace(/\.jpg$/i, '').split('_');
            namaPetugas = bagian.length >= 3 ? bagian.slice(1, bagian.length - 1).join(' ') : (bagian[1] || 'Petugas');
          }

          const kunci = namaPetugas.trim().toLowerCase();
          if (!stats[kunci]) {
            stats[kunci] = {
              nama: namaPetugas.trim(),
              rooms: new Set(),
              jumlahFoto: 0,
              terakhirTs: 0
            };
          }

          stats[kunci].rooms.add(namaRoom);
          stats[kunci].jumlahFoto++;
          const ts = file.timestamp ? file.timestamp * 1000 : (file.mtime ? new Date(file.mtime).getTime() : Date.now());
          if (ts > stats[kunci].terakhirTs) stats[kunci].terakhirTs = ts;
        });
      });

      const daftar = Object.values(stats).map(s => ({
        nama: s.nama,
        rooms: Array.from(s.rooms).join(', '),
        jumlahFoto: s.jumlahFoto,
        terakhirTs: s.terakhirTs,
        terakhirAktif: s.terakhirTs ? new Date(s.terakhirTs).toLocaleString('id-ID') : '—'
      })).sort((a, b) => b.jumlahFoto - a.jumlahFoto);

      return {
        totalPengguna: daftar.length,
        totalFoto,
        daftar
      };
    },

    // Host menarik seluruh berkas foto anggota dari folder MEGA ke memori/rekapan
    async tarikFotoRoom(namaRoom) {
      await this.pastikanTerhubung();
      const master = await this.dapatkanFolderMaster();
      const folderRoom = master.find(namaRoom.toUpperCase());
      if (!folderRoom || !folderRoom.children) return [];

      const hasil = [];
      folderRoom.children.forEach(file => {
        if (!file.name || !file.name.endsWith('.jpg')) return;
        let lat = null, lon = null;
        let namaPetugas = 'Petugas';
        let noUrut = null;

        const namaBersih = file.name.replace(/\.jpg$/i, '');
        if (file.name.includes('__')) {
          // Format lama: [ROOM]__[TS]__[LAT]__[LON]__[PETUGAS]
          const bagian = namaBersih.split('__');
          if (bagian.length >= 5) {
            lat = parseFloat(bagian[2]);
            lon = parseFloat(bagian[3]);
            namaPetugas = bagian[4].replace(/_/g, ' ');
          } else {
            namaPetugas = bagian[bagian.length - 1].replace(/_/g, ' ');
          }
        } else {
          // Format cerdas baru: [ROOM]_[USER]_[NOURUT]_[LAT]_[LON] atau [ROOM]_[USER]_[NOURUT]
          const bagian = namaBersih.split('_');
          if (bagian.length >= 5) {
            const pLat = parseFloat(bagian[bagian.length - 2]);
            const pLon = parseFloat(bagian[bagian.length - 1]);
            if (!isNaN(pLat) && !isNaN(pLon) && pLat >= -90 && pLat <= 90 && pLon >= -180 && pLon <= 180) {
              lat = pLat;
              lon = pLon;
              noUrut = parseInt(bagian[bagian.length - 3], 10) || null;
              namaPetugas = bagian.slice(1, bagian.length - 3).join(' ') || 'Petugas';
            }
          }
          if (lat === null) {
            if (bagian.length >= 3) {
              noUrut = parseInt(bagian[bagian.length - 1], 10) || null;
              namaPetugas = bagian.slice(1, bagian.length - 1).join(' ') || 'Petugas';
            } else {
              namaPetugas = bagian[1] || 'Petugas';
            }
          }
        }

        // Tangkap identifier unik secara tangguh (nodeId, h, atau downloadId)
        const nodeIdentifier = file.nodeId || file.h || (Array.isArray(file.downloadId) ? file.downloadId[1] : file.downloadId) || '';
        const idDeterministik = 'MEGA_' + (nodeIdentifier || file.name.replace(/[^\w-]/g, '_'));

        hasil.push({
          id: idDeterministik,
          nodeId: nodeIdentifier,
          namaBerkas: file.name,
          nama: namaPetugas,
          noUrut: noUrut,
          room: namaRoom.toUpperCase(),
          ts: file.timestamp ? file.timestamp * 1000 : Date.now(),
          lat: isNaN(lat) ? null : lat,
          lon: isNaN(lon) ? null : lon,
          ukuran: file.size || 0,
          linkDrive: `https://mega.nz/#${nodeIdentifier}`,
          status: 'terkirim',
          fileObj: file
        });
      });

      return hasil;
    },

    // Unduh berkas fisik foto dari MEGA ke format Base64 DataURL dan Blob
    async unduhFotoDataUrl(fileObj, timeoutMs = 45000) {
      if (!fileObj || typeof fileObj.downloadBuffer !== 'function') {
        throw new Error('Objek berkas MEGA tidak valid untuk diunduh');
      }
      const buffer = await withTimeout(
        fileObj.downloadBuffer(),
        timeoutMs,
        'Waktu unduh foto dari Cloud MEGA habis (timeout sinyal).'
      );
      const blob = new Blob([buffer], { type: 'image/jpeg' });
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve({ dataUrl: fr.result, blob, size: blob.size });
        fr.onerror = () => reject(new Error('Gagal membaca data gambar hasil unduh'));
        fr.readAsDataURL(blob);
      });
    }
  };

  window.MegaEngine = MegaEngine;
})(window);
