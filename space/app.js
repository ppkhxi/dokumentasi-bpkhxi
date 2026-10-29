/* spacedkpoint — kelola tabel, galeri, dan peta DKPoint dari desktop.
 * Login memakai akun MEGA yang sama dengan di HP. Tidak ada server: browser berbicara
 * langsung ke MEGA. Struktur data (dibuat oleh aplikasi HP):
 *   DKPOINT_DOKUMENTASI / <ROOM> / <PETUGAS> / ROOM_USER_NNN_LAT_LON.jpg
 *                                             / _indeks.json   (no, koordinat, catatan, waktu, thumbnail; diperbarui HP & space)
 *   DKPOINT_DOKUMENTASI / _peta / *.kml        (lapisan vektor, ditulis space)
 *                               / raster_*.jpg|png + raster_*.json  (lapisan raster + posisi/bounds, ditulis space)
 * Edit tabel di space MENIMPA berkas foto (EXIF GPS + deskripsi, dan nama berkas) serta _indeks.json.
 */
(function () {
  'use strict';
  // Pembacaan GeoPDF mencoba mengurai bagian PDF yang bukan zlib; galatnya tidak berpengaruh pada hasil.
  window.addEventListener('unhandledrejection', e => { if (/compressed data/i.test(String(e.reason && e.reason.message))) e.preventDefault(); });
  const FOLDER_MASTER = 'DKPOINT_DOKUMENTASI';
  const KUNCI_SESI = 'space_sesi_v1';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const S = {
    storage: null, demo: false, master: null,
    rows: [], folders: new Map(),            // folders: kunci "ROOM/PETUGAS" -> {node, edit:{}}
    f: { room: '', petugas: '', q: '' }, urut: { k: 'ts', turun: true },
    tab: 'tabel', sedangEdit: null, kml: [], raster: [], geser: null, blobFoto: new Map(),
    idxCache: new Map(), lengkap: new Map(), baruKey: new Set(), memuat: false, terakhir: null
  };

  /* ---------------- util ---------------- */
  function status(teks, galat) { const e = $('status'); e.textContent = teks || ''; e.className = 'status' + (galat ? ' galat' : ''); }
  function waktu(ts) { return ts ? new Date(ts).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '–'; }
  function angka(v) { return v == null || v === '' || !isFinite(v) ? '' : Number(v).toFixed(5); }
  async function pool(daftar, n, fn) {
    const antre = daftar.slice();
    await Promise.all(Array.from({ length: Math.min(n, antre.length) }, async () => { while (antre.length) await fn(antre.shift()); }));
  }
  async function bacaJson(node) { return JSON.parse(new TextDecoder().decode(await node.downloadBuffer())); }
  async function tulisJson(folder, nama, obj) {
    const lama = (folder.children || []).find(x => !x.directory && x.name === nama);
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    const aksi = folder.upload({ name: nama, size: bytes.byteLength }, bytes);
    await new Promise((res, rej) => { aksi.on('error', rej); aksi.complete.then(res).catch(rej); });
    if (lama) { try { await lama.delete(true); } catch (_) {} }
  }
  function pesanMega(err) {
    const m = String((err && err.message) || err || '');
    if (/-9\b|ENOENT|-8\b|EKEY|incorrect|Wrong/i.test(m)) return 'Email atau kata sandi salah.';
    if (/-26|EMFAREQUIRED|2FA|second factor/i.test(m)) return 'Akun ini memakai 2FA. Isi kode 6 digit.';
    if (/-16|EBLOCKED/i.test(m)) return 'Akun diblokir oleh MEGA.';
    if (/-3\b|EAGAIN|-4\b|EOVERQUOTA|timeout/i.test(m)) return 'MEGA sedang sibuk atau pembatasan sementara. Coba lagi sebentar lagi.';
    return 'Gagal terhubung ke MEGA: ' + m;
  }

  /* ---------------- login & sesi ---------------- */
  function simpanSesi(st, ingat) {
    try {
      const j = st.toJSON(); j.options = {};              // jangan simpan email/kata sandi
      (ingat ? localStorage : sessionStorage).setItem(KUNCI_SESI, JSON.stringify(j));
    } catch (_) {}
  }
  function hapusSesi() { try { localStorage.removeItem(KUNCI_SESI); sessionStorage.removeItem(KUNCI_SESI); } catch (_) {} }

  async function pulihkanSesi() {
    let mentah = null;
    try { mentah = sessionStorage.getItem(KUNCI_SESI) || localStorage.getItem(KUNCI_SESI); } catch (_) {}
    if (!mentah) return false;
    try {
      const st = mega.Storage.fromJSON(JSON.parse(mentah));
      await st.reload();
      S.storage = st; return true;
    } catch (e) { hapusSesi(); return false; }
  }

  $('formLogin').addEventListener('submit', async ev => {
    ev.preventDefault();
    const btn = $('btnMasuk'); $('galatLogin').textContent = '';
    btn.disabled = true; btn.textContent = 'Menghubungkan…';
    try {
      const opsi = { email: $('email').value.trim(), password: $('sandi').value, keepalive: false };
      if ($('kode').value.trim()) opsi.secondFactorCode = $('kode').value.trim();
      if (typeof mega === 'undefined' || !mega.Storage) throw new Error('Pustaka MEGA gagal dimuat (js/megajs.umd.js).');
      const st = new mega.Storage(opsi);
      await Promise.race([st.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: MEGA tidak merespons dalam 45 detik')), 45000))]);
      S.storage = st;
      simpanSesi(st, $('ingat').checked);
      $('sandi').value = '';
      await bukaApp(opsi.email);
    } catch (e) {
      console.error('Login MEGA gagal:', e);
      const m = pesanMega(e) + (e && e.message ? '  [rincian: ' + String(e.message).slice(0, 160) + ']' : '');
      $('galatLogin').textContent = m;
      if (/2FA/.test(m)) { $('barisKode').hidden = false; $('kode').focus(); }
    } finally { btn.disabled = false; btn.textContent = 'Masuk'; }
  });

  $('btnKeluar').onclick = () => { hapusSesi(); location.reload(); };
  $('btnMuat').onclick = () => muatData(true);
  $('linkDemo').onclick = e => { e.preventDefault(); location.search = '?demo'; };

  async function bukaApp(label) {
    $('login').hidden = true; $('app').hidden = false;
    $('infoAkun').textContent = S.demo ? 'Mode demo' : (label || (S.storage && S.storage.name) || 'Akun MEGA');
    await muatData(false);
  }

  /* ---------------- muat data ---------------- */
  function uraiNama(nama) {
    const b = nama.replace(/\.jpe?g$/i, '').split('_'); let lat = null, lon = null, no = null;
    if (b.length >= 5) {
      const la = parseFloat(b[b.length - 2]), lo = parseFloat(b[b.length - 1]);
      if (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) { lat = la; lon = lo; no = parseInt(b[b.length - 3], 10) || null; }
    } else if (b.length >= 3) no = parseInt(b[b.length - 1], 10) || null;
    return { lat, lon, no };
  }

  async function muatData(paksa, diam) {
    if (S.memuat) return;
    S.memuat = true;
    if (!diam) status('Membaca folder MEGA…');
    try {
      const sebelum = new Set(S.rows.map(r => r.key));
      if (S.demo) { demoData(); }
      else {
        if (paksa) { try { await S.storage.reload(true); } catch (_) { await S.storage.reload(); } }
        S.master = S.storage.find(FOLDER_MASTER);
        if (!S.master) { S.rows = []; status('Folder ' + FOLDER_MASTER + ' belum ada di akun ini. Unggah foto dari HP dulu.'); isiFilter(); render(); return; }
        await bacaFolder();
      }
      let baru = 0;
      if (diam && sebelum.size) S.rows.forEach(r => { if (!sebelum.has(r.key)) { S.baruKey.add(r.key); r.baru = true; baru++; } });
      S.terakhir = Date.now();
      $('terakhir').textContent = 'Diperbarui ' + new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
      isiFilter(); render();
      if (!diam) status(S.rows.length + ' foto dimuat dari ' + new Set(S.rows.map(r => r.petugas)).size + ' petugas.');
      else if (baru) status(baru + ' foto baru dari anggota.');
      if (S.tab === 'peta') pastikanPeta();
    } catch (e) { status('Gagal membaca MEGA: ' + (e.message || e), true); }
    finally { S.memuat = false; }
  }

  // Segarkan otomatis: anggota yang mengunggah muncul di sini tanpa menarik data.
  setInterval(() => { if (!S.demo && S.storage && !document.hidden && !S.sedangEdit && !$('app').hidden) muatData(true, true); }, 90000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !S.demo && S.storage && !S.sedangEdit && S.terakhir && Date.now() - S.terakhir > 45000) muatData(true, true);
  });

  async function bacaFolder() {
    const rows = []; S.folders = new Map();
    const unit = [];
    (S.master.children || []).filter(n => n.directory && !n.name.startsWith('_')).forEach(room => {
      unit.push({ room: room.name, petugas: '', node: room });
      (room.children || []).filter(n => n.directory).forEach(p => unit.push({ room: room.name, petugas: p.name, node: p }));
    });
    await pool(unit, 4, async u => {
      const anak = u.node.children || [];
      const jpg = anak.filter(n => !n.directory && /\.jpe?g$/i.test(n.name));
      if (!jpg.length) return;
      const nodeIdx = anak.find(n => !n.directory && n.name === '_indeks.json');
      let idx = {}; const edit = {}; const kf = u.room + '/' + u.petugas;
      if (nodeIdx) {
        const c = S.idxCache.get(kf);
        if (c && c.id === nodeIdx.nodeId) idx = c.idx;                       // indeks tidak berubah: pakai cache
        else { try { (await bacaJson(nodeIdx)).foto.forEach(x => idx[x.f] = x); S.idxCache.set(kf, { id: nodeIdx.nodeId, idx }); } catch (_) {} }
      }
      S.folders.set(u.room + '/' + u.petugas, { node: u.node, edit });
      jpg.forEach(n => {
        const i = idx[n.name], p = uraiNama(n.name), e = edit[n.name] || {};
        const asli = { no: i ? i.no : p.no, lat: i ? i.lat : p.lat, lon: i ? i.lon : p.lon, catatan: i ? i.c : '' };
        rows.push({
          key: u.room + '/' + u.petugas + '/' + n.name, f: n.name, room: u.room,
          petugas: u.petugas || (i && i.nm) || '(tanpa folder)', folder: u.room + '/' + u.petugas,
          no: e.no != null ? e.no : asli.no, lat: e.lat !== undefined ? e.lat : asli.lat,
          lon: e.lon !== undefined ? e.lon : asli.lon, catatan: e.c !== undefined ? e.c : asli.catatan,
          ts: (i && i.ts) || (n.timestamp ? n.timestamp * 1000 : 0), th: i ? i.th : '', node: n,
          diedit: Object.keys(e).length > 0, asli
        });
        const row = rows[rows.length - 1];
        const L = S.lengkap.get(row.key); if (L && !row.th) Object.assign(row, L);   // hasil pelengkapan yang belum tertulis ke indeks
        if (S.baruKey.has(row.key)) row.baru = true;
      });
    });
    S.rows = rows;
  }

  /* ---------------- pelengkapan foto tanpa indeks (APK lama) ---------------- */
  // Membaca teks EXIF (ImageDescription, DateTime) dari JPEG.
  function bacaExifTeks(u8) {
    const hasil = {};
    try {
      if (u8[0] !== 0xFF || u8[1] !== 0xD8) return hasil;
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let pos = 2;
      while (pos + 4 < u8.length && u8[pos] === 0xFF) {
        const mk = u8[pos + 1], len = dv.getUint16(pos + 2);
        if (mk === 0xDA) break;
        if (mk === 0xE1 && u8[pos + 4] === 0x45 && u8[pos + 5] === 0x78) {
          const t = pos + 10, le = u8[t] === 0x49, ifd = dv.getUint32(t + 4, le), n = dv.getUint16(t + ifd, le);
          for (let i = 0; i < n; i++) {
            const e = t + ifd + 2 + i * 12, tag = dv.getUint16(e, le), tipe = dv.getUint16(e + 2, le), cnt = dv.getUint32(e + 4, le);
            if (tipe !== 2 || (tag !== 0x010E && tag !== 0x0132)) continue;
            const off = cnt <= 4 ? e + 8 : t + dv.getUint32(e + 8, le);
            const teks = new TextDecoder('utf-8').decode(u8.subarray(off, off + Math.max(0, cnt - 1)));
            if (tag === 0x010E) hasil.desc = teks; else hasil.dt = teks;
          }
          break;
        }
        pos += 2 + len;
      }
    } catch (_) {}
    return hasil;
  }
  function tsDariExif(dt) {
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(dt || ''); if (!m) return 0;
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+07:00`); return isFinite(t) ? t : 0;   // jam perangkat (WIB)
  }
  async function bikinThumb(u8) {
    const bmp = await createImageBitmap(new Blob([u8], { type: 'image/jpeg' }));
    const k = Math.min(1, 240 / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
    return c.toDataURL('image/jpeg', 0.6);
  }

  const antreLengkap = []; let lengkapJalan = 0; const sedangLengkap = new Set(); const tertundaIndeks = new Map(); let timerIndeks = null, timerRender = null;
  function antreLengkapi(r) {
    if (S.demo || !r.node || r.th || sedangLengkap.has(r.key)) return;
    sedangLengkap.add(r.key); antreLengkap.push(r); jalankanLengkap();
  }
  async function jalankanLengkap() {
    while (lengkapJalan < 3 && antreLengkap.length) {
      const r = antreLengkap.shift(); lengkapJalan++;
      (async () => {
        try {
          const u8 = new Uint8Array(await r.node.downloadBuffer());
          const ex = bacaExifTeks(u8), th = await bikinThumb(u8);
          const desc = ex.desc && ex.desc !== 'Dokumentasi dkpoint' ? ex.desc : '';
          const upd = { th }; if (!r.catatan && desc) upd.catatan = desc; const t = tsDariExif(ex.dt); if (t) upd.ts = t;
          Object.assign(r, upd); S.lengkap.set(r.key, upd);
          const kf = r.folder; if (!tertundaIndeks.has(kf)) tertundaIndeks.set(kf, []);
          tertundaIndeks.get(kf).push({ f: r.f, no: r.no, lat: r.lat, lon: r.lon, ts: r.ts, c: r.catatan || '', nm: r.petugas, th });
          clearTimeout(timerIndeks); timerIndeks = setTimeout(tulisIndeksLengkap, 8000);
          clearTimeout(timerRender); timerRender = setTimeout(() => { if (!S.sedangEdit && (S.tab === 'tabel' || S.tab === 'galeri')) render(); }, 500);
        } catch (_) { /* dicoba lagi pada pemuatan berikutnya */ }
        finally { lengkapJalan--; sedangLengkap.delete(r.key); jalankanLengkap(); }
      })();
    }
  }
  // Simpan hasil pelengkapan ke _indeks.json supaya perangkat lain (dan HP) tidak mengulang unduhan.
  async function tulisIndeksLengkap() {
    for (const [kf, entri] of Array.from(tertundaIndeks)) {
      tertundaIndeks.delete(kf);
      try {
        const fol = S.folders.get(kf); if (!fol) continue;
        const nodeIdx = (fol.node.children || []).find(n => !n.directory && n.name === '_indeks.json');
        let daftar = []; if (nodeIdx) daftar = (await bacaJson(nodeIdx)).foto || [];
        const ada = new Set(daftar.map(x => x.f));
        entri.forEach(e => { if (!ada.has(e.f)) daftar.push(e); });          // tidak menimpa entri milik HP
        await tulisJson(fol.node, '_indeks.json', { v: 1, foto: daftar });
        S.idxCache.delete(kf);
      } catch (e) { console.warn('Indeks hasil pelengkapan gagal ditulis:', e); }
    }
  }
  const pengamat = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(en => {
    if (!en.isIntersecting) return; pengamat.unobserve(en.target);
    const r = S.rows.find(x => x.key === en.target.dataset.lazy); if (r) antreLengkapi(r);
  }), { rootMargin: '200px' }) : null;
  function amatiLazy() { if (pengamat) document.querySelectorAll('[data-lazy]').forEach(el => pengamat.observe(el)); }

  /* ---------------- filter, urut, tampilan ---------------- */
  function isiFilter() {
    const rooms = [...new Set(S.rows.map(r => r.room))].sort();
    const pil = $('fRoom'); const v = S.f.room;
    pil.innerHTML = '<option value="">Semua room</option>' + rooms.map(r => `<option ${r === v ? 'selected' : ''}>${esc(r)}</option>`).join('');
    isiPetugas();
  }
  function isiPetugas() {
    const daftar = [...new Set(S.rows.filter(r => !S.f.room || r.room === S.f.room).map(r => r.petugas))].sort();
    const v = S.f.petugas;
    $('fPetugas').innerHTML = '<option value="">Semua petugas</option>' + daftar.map(p => `<option ${p === v ? 'selected' : ''}>${esc(p)}</option>`).join('');
  }
  $('fRoom').onchange = e => { S.f.room = e.target.value; S.f.petugas = ''; isiPetugas(); render(); };
  $('fPetugas').onchange = e => { S.f.petugas = e.target.value; render(); };
  $('fCari').oninput = e => { S.f.q = e.target.value.trim().toLowerCase(); render(); };

  function tersaring() {
    const { room, petugas, q } = S.f; const { k, turun } = S.urut;
    const out = S.rows.filter(r => (!room || r.room === room) && (!petugas || r.petugas === petugas) &&
      (!q || [r.catatan, r.petugas, r.room, r.no, r.f].join(' ').toLowerCase().includes(q)));
    out.sort((a, b) => {
      const x = a[k], y = b[k]; const sx = x == null ? '' : x, sy = y == null ? '' : y;
      const c = typeof sx === 'number' && typeof sy === 'number' ? sx - sy : String(sx).localeCompare(String(sy), 'id', { numeric: true });
      return turun ? -c : c;
    });
    return out;
  }

  document.querySelectorAll('#tab button').forEach(b => b.onclick = () => {
    S.tab = b.dataset.v;
    document.querySelectorAll('#tab button').forEach(x => x.classList.toggle('pilih', x === b));
    ['tabel', 'galeri', 'peta'].forEach(v => $('v' + v[0].toUpperCase() + v.slice(1)).hidden = v !== S.tab);
    render();
  });

  function render() {
    if (S.tab === 'tabel') renderTabel();
    else if (S.tab === 'galeri') renderGaleri();
    else pastikanPeta();
  }

  /* ---------------- tabel ---------------- */
  function renderTabel() {
    const data = tersaring();
    $('jumlah').textContent = data.length + ' dari ' + S.rows.length + ' foto';
    document.querySelectorAll('#tabel th').forEach(th => {
      th.classList.toggle('urut', th.dataset.k === S.urut.k);
      th.classList.toggle('turun', th.dataset.k === S.urut.k && S.urut.turun);
    });
    $('tabel').querySelector('tbody').innerHTML = data.slice(0, 1500).map(r => {
      if (S.sedangEdit === r.key) {
        return `<tr class="diedit-baris" data-key="${esc(r.key)}">
          <td><input data-f="no" value="${esc(r.no == null ? '' : r.no)}" size="4"></td>
          <td>${esc(r.room)}</td><td>${esc(r.petugas)}</td>
          <td><input data-f="lat" value="${esc(r.lat == null ? '' : r.lat)}"></td>
          <td><input data-f="lon" value="${esc(r.lon == null ? '' : r.lon)}"></td>
          <td>${esc(waktu(r.ts))}</td>
          <td class="catatan"><input data-f="catatan" maxlength="250" value="${esc(r.catatan)}"></td>
          <td>${r.th ? `<img class="th" src="${r.th}" alt="">` : ''}</td>
          <td><button data-aksi="simpan" class="utama">Simpan</button> <button data-aksi="batal">Batal</button></td></tr>`;
      }
      const d = r.diedit ? ' class="diedit"' : '';
      return `<tr data-key="${esc(r.key)}"><td${d}>${r.baru ? '<span class="lencana">baru</span> ' : ''}${esc(r.no == null ? '' : r.no)}</td><td>${esc(r.room)}</td><td>${esc(r.petugas)}</td>
        <td>${angka(r.lat)}</td><td>${angka(r.lon)}</td><td>${esc(waktu(r.ts))}</td>
        <td class="catatan">${esc(r.catatan)}</td>
        <td>${r.th ? `<img class="th" data-aksi="foto" src="${r.th}" alt="">` : `<button data-aksi="foto" data-lazy="${esc(r.key)}">Lihat</button>`}</td>
        <td><button data-aksi="edit">Edit</button></td></tr>`;
    }).join('') || '<tr><td colspan="9" class="kecil">Belum ada data.</td></tr>';
    if (data.length > 1500) status('Menampilkan 1500 baris pertama; persempit dengan filter.');
    amatiLazy();
  }
  $('tabel').querySelector('thead').onclick = e => {
    const th = e.target.closest('th[data-k]'); if (!th) return;
    S.urut = { k: th.dataset.k, turun: S.urut.k === th.dataset.k ? !S.urut.turun : false };
    renderTabel();
  };
  $('tabel').querySelector('tbody').onclick = async e => {
    const el = e.target.closest('[data-aksi]'); const tr = e.target.closest('tr[data-key]'); if (!el || !tr) return;
    const r = S.rows.find(x => x.key === tr.dataset.key); if (!r) return;
    const aksi = el.dataset.aksi;
    if (aksi === 'foto') bukaFoto(r);
    else if (aksi === 'edit') { S.sedangEdit = r.key; renderTabel(); }
    else if (aksi === 'batal') { S.sedangEdit = null; renderTabel(); }
    else if (aksi === 'simpan') await simpanEdit(r, tr);
  };

  /* Nama berkas baru: ROOM_USER_NNN_LAT_LON.jpg (pola yang sama dengan unggahan HP). */
  function namaBerkasBaru(nama, no, lat, lon) {
    if (nama.includes('__')) return nama;                       // format lama: nama dibiarkan
    const b = nama.replace(/\.jpe?g$/i, '').split('_'); let awalan;
    const adaKoord = b.length >= 5 && isFinite(parseFloat(b[b.length - 2])) && isFinite(parseFloat(b[b.length - 1]));
    if (adaKoord) awalan = b.slice(0, b.length - 3).join('_');
    else if (b.length >= 3 && /^\d+$/.test(b[b.length - 1])) awalan = b.slice(0, b.length - 1).join('_');
    else return nama;
    const nn = String(no == null ? 1 : no).padStart(3, '0');
    const k = lat != null && lon != null ? '_' + Number(lat).toFixed(5) + '_' + Number(lon).toFixed(5) : '';
    return awalan + '_' + nn + k + '.jpg';
  }
  async function unggahNode(folder, nama, bytes) {
    const aksi = folder.upload({ name: nama, size: bytes.byteLength }, bytes);
    return new Promise((res, rej) => { aksi.on('error', rej); aksi.complete.then(res).catch(rej); });
  }

  async function simpanEdit(r, tr) {
    const val = f => tr.querySelector(`[data-f="${f}"]`).value.trim();
    const num = (t, lo, hi) => { if (t === '') return null; const v = Number(t.replace(',', '.')); return isFinite(v) && v >= lo && v <= hi ? v : NaN; };
    const no = num(val('no'), 0, 99999), lat = num(val('lat'), -90, 90), lon = num(val('lon'), -180, 180), cat = val('catatan').slice(0, 250);
    if ([no, lat, lon].some(Number.isNaN)) { status('Nilai tidak valid. Nomor harus angka; latitude -90..90; longitude -180..180.', true); return; }
    if ((lat == null) !== (lon == null)) { status('Isi latitude dan longitude bersama-sama, atau kosongkan keduanya.', true); return; }
    if (no === r.no && lat === r.lat && lon === r.lon && cat === (r.catatan || '')) { S.sedangEdit = null; renderTabel(); return; }
    if (!S.demo && !confirm('Perubahan ini MENIMPA berkas foto asli di MEGA (EXIF dan nama berkas) dan tidak bisa dikembalikan.\n\nCatatan: tulisan watermark di dalam gambar tidak ikut berubah.\n\nLanjutkan?')) return;
    status('Menyimpan ke foto di MEGA…');
    try {
      const nama = namaBerkasBaru(r.f, no, lat, lon);
      if (!S.demo) {
        const fol = S.folders.get(r.folder).node;
        if (nama !== r.f && (fol.children || []).some(n => n.name === nama)) throw new Error('Sudah ada berkas bernama ' + nama + ' di folder ini.');
        let bytes = new Uint8Array(await r.node.downloadBuffer());
        if (lat != null && lon != null) bytes = window.ExifGps.sematkan(bytes, { lat, lon, ts: r.ts || Date.now(), deskripsi: cat || 'Dokumentasi dkpoint' });
        const nodeBaru = await unggahNode(fol, nama, bytes);          // unggah dulu, baru hapus yang lama
        try { await r.node.delete(true); } catch (_) {}
        // perbarui _indeks.json di folder petugas
        const nodeIdx = (fol.children || []).find(n => !n.directory && n.name === '_indeks.json');
        let daftar = []; if (nodeIdx) { try { daftar = (await bacaJson(nodeIdx)).foto || []; } catch (_) {} }
        const lama = daftar.find(x => x.f === r.f) || { ts: r.ts, nm: r.petugas, th: r.th || '' };
        daftar = daftar.filter(x => x.f !== r.f && x.f !== nama);
        daftar.push(Object.assign({}, lama, { f: nama, no, lat, lon, c: cat }));
        await tulisJson(fol, '_indeks.json', { v: 1, foto: daftar });
        r.node = nodeBaru;
      }
      r.f = nama; r.key = r.folder + '/' + nama;
      r.no = no; r.lat = lat; r.lon = lon; r.catatan = cat;
      S.blobFoto.delete(r.key);
      S.sedangEdit = null; renderTabel(); status('Tersimpan di berkas foto.');
    } catch (err) { status('Gagal menyimpan ke MEGA: ' + (err.message || err), true); }
  }

  /* ---------------- unduh ---------------- */
  function unduh(nama, isi, tipe) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([isi], { type: tipe })); a.download = nama;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $('btnCsv').onclick = () => {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const baris = [['No', 'Room', 'Petugas', 'Latitude', 'Longitude', 'Waktu', 'Catatan', 'Berkas'].map(q).join(',')];
    tersaring().forEach(r => baris.push([r.no, r.room, r.petugas, r.lat, r.lon, waktu(r.ts), r.catatan, r.f].map(q).join(',')));
    unduh('dkpoint-tabel.csv', '﻿' + baris.join('\r\n'), 'text/csv;charset=utf-8');
  };
  $('btnKml').onclick = () => {
    const pm = tersaring().filter(r => r.lat != null && r.lon != null).map(r =>
      `<Placemark><name>${esc(r.room + ' ' + (r.no == null ? '' : r.no))}</name><description>${esc(r.catatan)}</description><Point><coordinates>${r.lon},${r.lat},0</coordinates></Point></Placemark>`).join('');
    unduh('dkpoint-titik.kml', `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>DKPoint</name>${pm}</Document></kml>`, 'application/vnd.google-earth.kml+xml');
  };

  /* ---------------- galeri & foto ---------------- */
  function renderGaleri() {
    const data = tersaring().slice(0, 600);
    $('grid').innerHTML = data.map(r => `<div class="sel" data-key="${esc(r.key)}" ${r.th ? '' : `data-lazy="${esc(r.key)}"`}>
      <div class="gbr">${r.th ? `<img src="${r.th}" alt="" loading="lazy">` : 'Tanpa thumbnail'}</div>
      <div class="ket"><b>${esc(r.room)} · ${esc(r.no == null ? '–' : r.no)}</b><span>${esc(r.petugas)}</span><span>${esc(r.catatan || '')}</span></div></div>`).join('') || '<p class="kecil">Belum ada foto.</p>';
    amatiLazy();
  }
  $('grid').onclick = e => { const s = e.target.closest('.sel'); if (!s) return; const r = S.rows.find(x => x.key === s.dataset.key); if (r) bukaFoto(r); };

  async function bukaFoto(r) {
    $('lightbox').hidden = false;
    $('lbJudul').textContent = r.room + ' · ' + (r.no == null ? '–' : r.no);
    $('lbRincian').innerHTML = [['Petugas', r.petugas], ['Koordinat', angka(r.lat) + ', ' + angka(r.lon)], ['Waktu', waktu(r.ts)], ['Catatan', r.catatan || '–'], ['Berkas', r.f]]
      .map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    const img = $('lbGambar'); img.removeAttribute('src'); img.src = r.th || ''; $('lbMuat').hidden = false;
    $('lbUnduh').removeAttribute('href'); $('lbUnduh').download = r.f;
    try {
      let url = S.blobFoto.get(r.key);
      if (!url && !S.demo) { url = URL.createObjectURL(new Blob([await r.node.downloadBuffer()], { type: 'image/jpeg' })); S.blobFoto.set(r.key, url); }
      if (url) { img.src = url; $('lbUnduh').href = url; }
    } catch (_) { $('lbMuat').textContent = 'Foto penuh tidak bisa diunduh.'; return; }
    $('lbMuat').hidden = true; $('lbMuat').textContent = 'Mengunduh foto…';
  }
  const tutupFoto = () => { $('lightbox').hidden = true; };
  $('lbTutup').onclick = tutupFoto;
  $('lightbox').onclick = e => { if (e.target === $('lightbox')) tutupFoto(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') tutupFoto(); });

  /* ---------------- peta & lapisan ---------------- */
  let peta = null, dasarOsm, dasarSat, lapisFoto, petaSiap = false;
  const WARNA = ['#f59e0b', '#38bdf8', '#e879f9', '#a3e635', '#fb7185', '#2dd4bf'];

  function pastikanPeta() {
    if (!window.L) return;
    if (!peta) {
      peta = L.map('peta', { zoomControl: true }).setView([-7.8, 110.4], 9);
      dasarOsm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(peta);
      dasarSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' });
      document.querySelectorAll('input[name=dasar]').forEach(r => r.onchange = () => {
        if (r.value === 'sat' && r.checked) { peta.removeLayer(dasarOsm); dasarSat.addTo(peta); dasarSat.bringToBack(); }
        else if (r.checked) { peta.removeLayer(dasarSat); dasarOsm.addTo(peta); dasarOsm.bringToBack(); }
      });
      lapisFoto = L.featureGroup().addTo(peta);
      peta.lapisRaster = new Map();                 // dipakai fungsi raster di peta.js
      pasangRodaRaster();
    }
    setTimeout(() => peta.invalidateSize(), 50);
    gambarTitikFoto();
    if (!petaSiap) { petaSiap = true; muatDaftarKml(); }
  }

  function gambarTitikFoto() {
    lapisFoto.clearLayers();
    tersaring().filter(r => r.lat != null && r.lon != null).forEach(r => {
      L.circleMarker([r.lat, r.lon], { radius: 6, color: '#052e16', weight: 1.5, fillColor: '#22c55e', fillOpacity: .9 })
        .bindPopup(`<b>${esc(r.room)} · ${esc(r.no == null ? '–' : r.no)}</b><br>${esc(r.petugas)}<br>${esc(r.catatan || '')}<br>${r.th ? `<img src="${r.th}" style="width:160px;border-radius:6px;margin-top:4px">` : ''}`)
        .addTo(lapisFoto);
    });
    if (lapisFoto.getLayers().length && !S.sudahZoom) { peta.fitBounds(lapisFoto.getBounds().pad(.2)); S.sudahZoom = true; }
    daftarLapisan();
  }

  function kmlKeLayer(teks, warna) {
    const doc = new DOMParser().parseFromString(teks, 'text/xml'); const fg = L.featureGroup();
    const koord = el => (el ? el.textContent.trim().split(/\s+/) : []).map(c => c.split(',').map(Number)).filter(a => a.length >= 2 && isFinite(a[0]) && isFinite(a[1])).map(a => [a[1], a[0]]);
    const gaya = { color: warna, weight: 2, fillColor: warna, fillOpacity: .25, opacity: 1 };
    doc.querySelectorAll('Placemark').forEach(pm => {
      const nama = (pm.querySelector('name') || {}).textContent || '', ket = (pm.querySelector('description') || {}).textContent || '';
      const pop = `<b>${esc(nama)}</b>${ket ? '<br>' + esc(ket.replace(/<[^>]+>/g, ' ').slice(0, 400)) : ''}`;
      pm.querySelectorAll('Point').forEach(p => { const c = koord(p.querySelector('coordinates'))[0]; if (c) L.circleMarker(c, Object.assign({ radius: 5 }, gaya, { fillOpacity: .9 })).bindPopup(pop).addTo(fg); });
      pm.querySelectorAll('LineString').forEach(l => { const c = koord(l.querySelector('coordinates')); if (c.length > 1) L.polyline(c, gaya).bindPopup(pop).addTo(fg); });
      pm.querySelectorAll('Polygon').forEach(pg => {
        const luar = koord(pg.querySelector('outerBoundaryIs coordinates'));
        const dalam = [...pg.querySelectorAll('innerBoundaryIs coordinates')].map(koord);
        if (luar.length > 2) L.polygon([luar].concat(dalam), gaya).bindPopup(pop).addTo(fg);
      });
    });
    return fg;
  }

  async function muatDaftarKml() {
    S.kml = [];
    if (S.demo) {
      S.kml.push({ nama: 'contoh-batas.kml', node: null, layer: kmlKeLayer(DEMO_KML, WARNA[0]), aktif: true, warna: WARNA[0], opa: 1 });
      S.kml[0].layer.addTo(peta);
    } else if (S.master) {
      const folder = (S.master.children || []).find(n => n.directory && n.name === '_peta');
      const berkas = folder ? (folder.children || []).filter(n => !n.directory && /\.kml$/i.test(n.name)) : [];
      berkas.forEach((n, i) => S.kml.push({ nama: n.name, node: n, layer: null, aktif: false, warna: WARNA[i % WARNA.length], opa: 1 }));
    }
    await muatDaftarRaster();
    daftarLapisan();
  }

  function daftarLapisan() {
    const ul = $('daftarLapisan');
    const foto = `<li><div class="baris"><label><input type="checkbox" id="cbFoto" ${peta && peta.hasLayer(lapisFoto) ? 'checked' : ''}> Titik foto (${lapisFoto ? lapisFoto.getLayers().length : 0})</label></div></li>`;
    ul.innerHTML = foto + S.kml.map((k, i) => `<li data-i="${i}"><div class="baris">
      <label title="${esc(k.nama)}"><input type="checkbox" data-a="aktif" ${k.aktif ? 'checked' : ''}> <span style="color:${k.warna}">●</span> ${esc(k.nama)}</label>
      <button class="mini" data-a="zoom" title="Perbesar ke lapisan">⌖</button><button class="mini" data-a="hapus" title="Hapus">✕</button></div>
      <input type="range" data-a="opa" min="0.1" max="1" step="0.1" value="${k.opa}" title="Transparansi"></li>`).join('') +
      S.raster.map((r, i) => `<li data-r="${i}"><div class="baris">
      <label title="${esc(r.nama)}"><input type="checkbox" data-a="raktif" ${r.aktif ? 'checked' : ''}> 🗺 ${esc(r.nama)}</label>
      <button class="mini" data-a="rzoom" title="Perbesar ke raster">⌖</button><button class="mini" data-a="rhapus" title="Hapus">✕</button></div>
      <input type="range" data-a="ropa" min="0.1" max="1" step="0.05" value="${r.opa}" title="Transparansi">
      <div class="baris" style="margin-top:6px;flex-wrap:wrap">
        <button class="mini ${S.geser === r.id ? 'utama' : ''}" data-a="rgeser" title="Seret raster untuk memindahkan; roda mouse untuk memperbesar/memperkecil (rasio tetap)">Shift${S.geser === r.id ? ' (aktif)' : ''}</button>
        ${S.geser === r.id ? '<button class="mini" data-a="rminus">−</button><button class="mini" data-a="rplus">+</button>' : ''}
        ${r.kotor ? '<button class="mini utama" data-a="rsimpan">Simpan posisi</button>' : ''}</div></li>`).join('');
    const cb = $('cbFoto'); if (cb) cb.onchange = () => cb.checked ? peta.addLayer(lapisFoto) : peta.removeLayer(lapisFoto);
  }

  $('daftarLapisan').addEventListener('input', e => { if (e.target.dataset.a === 'opa') aturOpa(e); });
  $('daftarLapisan').addEventListener('change', e => { if (e.target.dataset.a === 'aktif') ubahAktif(e); });
  $('daftarLapisan').addEventListener('click', async e => {
    const a = e.target.dataset.a; if (a !== 'zoom' && a !== 'hapus') return;
    const li = e.target.closest('li[data-i]'); const k = S.kml[+li.dataset.i];
    if (a === 'zoom') { await pastikanLayerKml(k); if (k.layer && k.layer.getLayers().length) peta.fitBounds(k.layer.getBounds().pad(.1)); }
    else if (confirm('Hapus ' + k.nama + ' dari MEGA? (masuk Tempat Sampah MEGA)')) {
      try { if (k.layer) peta.removeLayer(k.layer); if (k.node && !S.demo) await k.node.delete(); S.kml.splice(+li.dataset.i, 1); daftarLapisan(); status('Lapisan dihapus.'); }
      catch (err) { status('Gagal menghapus: ' + (err.message || err), true); }
    }
  });
  async function pastikanLayerKml(k) {
    if (k.layer) return;
    status('Mengunduh ' + k.nama + '…');
    try { k.layer = kmlKeLayer(new TextDecoder().decode(await k.node.downloadBuffer()), k.warna); status(''); }
    catch (err) { status('KML tidak bisa dibaca: ' + (err.message || err), true); }
  }
  async function ubahAktif(e) {
    const k = S.kml[+e.target.closest('li[data-i]').dataset.i]; k.aktif = e.target.checked;
    if (k.aktif) { await pastikanLayerKml(k); if (k.layer) { k.layer.addTo(peta); aturStyle(k); } } else if (k.layer) peta.removeLayer(k.layer);
  }
  function aturStyle(k) { if (k.layer) k.layer.eachLayer(l => l.setStyle && l.setStyle({ opacity: k.opa, fillOpacity: k.opa * .25 })); }
  function aturOpa(e) { const k = S.kml[+e.target.closest('li[data-i]').dataset.i]; k.opa = +e.target.value; aturStyle(k); }

  $('fileKml').onchange = async e => {
    const berkas = e.target.files[0]; e.target.value = ''; if (!berkas) return;
    if (!/\.kml$/i.test(berkas.name)) { status('Pilih berkas .kml', true); return; }
    try {
      const teks = await berkas.text();
      const layer = kmlKeLayer(teks, WARNA[S.kml.length % WARNA.length]);
      if (!layer.getLayers().length) { status('KML tidak berisi titik, garis, atau poligon yang dikenali.', true); return; }
      let node = null;
      if (!S.demo) {
        status('Mengunggah ke MEGA…');
        let folder = (S.master.children || []).find(n => n.directory && n.name === '_peta');
        if (!folder) folder = await S.storage.mkdir({ name: '_peta', target: S.master });
        const bytes = new TextEncoder().encode(teks);
        const aksi = folder.upload({ name: berkas.name, size: bytes.byteLength }, bytes);
        node = await new Promise((res, rej) => { aksi.on('error', rej); aksi.complete.then(res).catch(rej); });
      }
      const k = { nama: berkas.name, node, layer, aktif: true, warna: WARNA[S.kml.length % WARNA.length], opa: 1 };
      S.kml.push(k); layer.addTo(peta); peta.fitBounds(layer.getBounds().pad(.1)); daftarLapisan(); status('Lapisan ditambahkan.');
    } catch (err) { status('Gagal menambah KML: ' + (err.message || err), true); }
  };

  /* ---------------- raster (JPG / PNG / PDF, georeferensi) ---------------- */
  const bKeArray = b => [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]];
  async function folderPeta() {
    let f = (S.master.children || []).find(n => n.directory && n.name === '_peta');
    if (!f) f = await S.storage.mkdir({ name: '_peta', target: S.master });
    return f;
  }
  const rasterId = id => S.raster.find(r => r.id === id);

  async function muatDaftarRaster() {
    S.raster = [];
    if (S.demo) {
      const c = document.createElement('canvas'); c.width = 600; c.height = 400; const g = c.getContext('2d');
      g.fillStyle = '#e9d8a6'; g.fillRect(0, 0, 600, 400); g.strokeStyle = '#7f5539'; g.lineWidth = 3;
      for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(i * 100, 0); g.lineTo(i * 100, 400); g.stroke(); }
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 100); g.lineTo(600, i * 100); g.stroke(); }
      g.fillStyle = '#7f5539'; g.font = '40px sans-serif'; g.fillText('RASTER CONTOH', 150, 210);
      S.raster.push({ id: 'raster_demo', nama: 'contoh-raster.png', bounds: [[-7.86, 110.30], [-7.74, 110.50]], opa: 0.75, aktif: true, url: c.toDataURL('image/png'), folder: null, kotor: false });
      PETA.pasangRaster(peta, 'raster_demo', S.raster[0].url, S.raster[0].bounds, 0.75);
      return;
    }
    const folder = S.master && (S.master.children || []).find(n => n.directory && n.name === '_peta');
    if (!folder) return;
    const js = (folder.children || []).filter(n => !n.directory && /^raster_.*\.json$/i.test(n.name));
    await pool(js, 3, async n => {
      try {
        const m = await bacaJson(n);
        const img = (folder.children || []).find(x => x.name === m.img);
        if (img && m.bounds) S.raster.push({ id: n.name.replace(/\.json$/i, ''), nama: m.nama || m.img, bounds: m.bounds, opa: m.opasitas || 0.75, aktif: false, w: m.w, h: m.h, nodeImg: img, folder, url: null, kotor: false });
      } catch (_) {}
    });
    S.raster.sort((a, b) => a.id.localeCompare(b.id));
  }

  async function tulisJsonRaster(r) {
    await tulisJson(r.folder, r.id + '.json', { v: 1, nama: r.nama, img: r.nodeImg.name, bounds: r.bounds, opasitas: r.opa, w: r.w, h: r.h, ts: Date.now() });
  }

  async function pasangLayerRaster(r) {
    if (!r.url) {
      status('Mengunduh ' + r.nama + '…');
      const buf = await r.nodeImg.downloadBuffer();
      r.url = URL.createObjectURL(new Blob([buf], { type: /\.png$/i.test(r.nodeImg.name) ? 'image/png' : 'image/jpeg' }));
      status('');
    }
    PETA.pasangRaster(peta, r.id, r.url, r.bounds, r.opa);
  }
  function lepasLayerRaster(r) {
    const ov = peta.lapisRaster.get(r.id);
    if (ov) r.bounds = bKeArray(ov.getBounds());
    if (S.geser === r.id) hentikanGeser();
    PETA.hapusRaster(peta, r.id);
  }
  function hentikanGeser() { S.geser = null; try { PETA.nonaktifkanDragRaster(peta); } catch (_) {} }

  // Roda mouse = perbesar/perkecil raster (rasio tetap) selama mode Shift aktif dan kursor di atas raster.
  function pasangRodaRaster() {
    peta.getContainer().addEventListener('wheel', e => {
      if (!S.geser) return;
      const ov = peta.lapisRaster.get(S.geser); if (!ov) return;
      if (!ov.getBounds().contains(peta.mouseEventToLatLng(e))) return;
      e.preventDefault(); e.stopPropagation();
      PETA.skalaRaster(peta, S.geser, e.deltaY < 0 ? 1.06 : 1 / 1.06);
      const r = rasterId(S.geser); if (r && !r.kotor) { r.kotor = true; daftarLapisan(); }
    }, { passive: false, capture: true });
  }

  $('daftarLapisan').addEventListener('input', e => {
    if (e.target.dataset.a !== 'ropa') return;
    const r = S.raster[+e.target.closest('li[data-r]').dataset.r]; r.opa = +e.target.value;
    PETA.setOpasitasRaster(peta, r.id, r.opa);
    if (r.folder && !r.kotor) { r.kotor = true; daftarLapisan(); }
  });
  $('daftarLapisan').addEventListener('change', async e => {
    if (e.target.dataset.a !== 'raktif') return;
    const r = S.raster[+e.target.closest('li[data-r]').dataset.r]; r.aktif = e.target.checked;
    try { if (r.aktif) await pasangLayerRaster(r); else lepasLayerRaster(r); }
    catch (err) { r.aktif = false; e.target.checked = false; status('Raster tidak bisa dimuat: ' + (err.message || err), true); }
    daftarLapisan();
  });
  $('daftarLapisan').addEventListener('click', async e => {
    const a = e.target.dataset.a; if (!a || a[0] !== 'r') return;
    const li = e.target.closest('li[data-r]'); if (!li) return; const r = S.raster[+li.dataset.r];
    if (a === 'rzoom') {
      if (!r.aktif) { r.aktif = true; try { await pasangLayerRaster(r); } catch (err) { r.aktif = false; status('Raster tidak bisa dimuat: ' + (err.message || err), true); return; } }
      const ov = peta.lapisRaster.get(r.id); if (ov) peta.fitBounds(ov.getBounds().pad(.1)); daftarLapisan();
    } else if (a === 'rgeser') {
      if (S.geser === r.id) { hentikanGeser(); }
      else {
        if (!r.aktif) { r.aktif = true; try { await pasangLayerRaster(r); } catch (err) { r.aktif = false; status('Raster tidak bisa dimuat: ' + (err.message || err), true); return; } }
        hentikanGeser(); S.geser = r.id;
        PETA.aktifkanDragRaster(peta, r.id, () => { if (!r.kotor) { r.kotor = true; daftarLapisan(); } });
        PETA.setModeGeserRaster(peta, true);
        status('Mode Shift aktif: seret raster untuk memindahkan, roda mouse atau tombol +/− untuk skala. Di luar raster peta bergerak biasa.');
      }
      daftarLapisan();
    } else if (a === 'rplus' || a === 'rminus') {
      PETA.skalaRaster(peta, r.id, a === 'rplus' ? 1.1 : 1 / 1.1); if (!r.kotor) { r.kotor = true; daftarLapisan(); }
    } else if (a === 'rsimpan') {
      const ov = peta.lapisRaster.get(r.id); if (ov) r.bounds = bKeArray(ov.getBounds());
      try { if (r.folder && !S.demo) { status('Menyimpan posisi…'); await tulisJsonRaster(r); } r.kotor = false; status('Posisi raster tersimpan.'); daftarLapisan(); }
      catch (err) { status('Gagal menyimpan posisi: ' + (err.message || err), true); }
    } else if (a === 'rhapus') {
      if (!confirm('Hapus raster ' + r.nama + ' dari MEGA? (masuk Tempat Sampah MEGA)')) return;
      try {
        lepasLayerRaster(r);
        if (r.folder && !S.demo) { try { await r.nodeImg.delete(); } catch (_) {} const nj = (r.folder.children || []).find(n => n.name === r.id + '.json'); if (nj) { try { await nj.delete(); } catch (_) {} } }
        S.raster.splice(+li.dataset.r, 1); daftarLapisan(); status('Raster dihapus.');
      } catch (err) { status('Gagal menghapus: ' + (err.message || err), true); }
    }
  });

  $('fileRaster').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (!/\.(jpe?g|png|pdf)$/i.test(f.name)) { status('Pilih berkas JPG, PNG, atau PDF.', true); return; }
    try {
      status('Memproses ' + f.name + '…');
      const hasil = await kompresGambarRaster(f);
      const R = hasil.ratio || (hasil.width / hasil.height);
      let bounds = null, info = '';
      if (/\.pdf$/i.test(f.name)) {
        const geo = await ekstrakGeoPdf(f);
        if (geo && geo.bounds) { bounds = geo.bounds; info = ' (sesuai georeferensi GeoPDF' + (geo.epsg ? ' EPSG:' + geo.epsg : '') + ')'; }
      }
      if (!bounds) {                                     // tanpa georeferensi: tempatkan di tengah tampilan, rasio utuh
        const c = peta.getCenter(), v = peta.getBounds();
        const dLat = Math.min(Math.abs(v.getNorth() - v.getSouth()) * 0.5, 0.2);
        const dLon = (dLat * R) / Math.max(0.15, Math.cos(c.lat * Math.PI / 180));
        bounds = [[c.lat - dLat / 2, c.lng - dLon / 2], [c.lat + dLat / 2, c.lng + dLon / 2]];
        info = ' (diletakkan di tengah peta; atur dengan Shift)';
      }
      const id = 'raster_' + Date.now();
      const png = /^data:image\/png/.test(hasil.dataUrl);
      const nama = f.name.replace(/\.[^.]+$/, '') + (png ? '.png' : '.jpg');
      const r = { id, nama, bounds, opa: 0.75, aktif: true, w: hasil.width, h: hasil.height, url: hasil.dataUrl, folder: null, kotor: false };
      if (!S.demo) {
        status('Mengunggah raster ke MEGA… (' + hasil.ukuranKB + ' KB)');
        r.folder = await folderPeta();
        r.nodeImg = await unggahNode(r.folder, id + (png ? '.png' : '.jpg'), window.ExifGps.dataUrlKeUint8Array(hasil.dataUrl));
        await tulisJsonRaster(r);
      }
      S.raster.push(r);
      PETA.pasangRaster(peta, id, r.url, bounds, r.opa);
      PETA.zoomKeBounds(peta, bounds, [40, 40]);
      daftarLapisan(); status('Raster "' + nama + '" ditambahkan' + info + '.');
    } catch (err) { status('Gagal menambah raster: ' + (err.message || err), true); }
  };

  /* ---------------- mode demo (tanpa MEGA) ---------------- */
  const DEMO_KML = '<kml><Document><Placemark><name>Batas contoh</name><Polygon><outerBoundaryIs><LinearRing><coordinates>110.30,-7.70 110.50,-7.70 110.50,-7.90 110.30,-7.90 110.30,-7.70</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>';
  function thumbPalsu(n) {
    const c = document.createElement('canvas'); c.width = 240; c.height = 180; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 240, 180); gr.addColorStop(0, `hsl(${(n * 47) % 360},40%,30%)`); gr.addColorStop(1, `hsl(${(n * 47 + 60) % 360},45%,18%)`);
    g.fillStyle = gr; g.fillRect(0, 0, 240, 180); g.fillStyle = '#fff8'; g.font = '40px sans-serif'; g.fillText('#' + n, 20, 100);
    return c.toDataURL('image/jpeg', .6);
  }
  function demoData() {
    S.rows = []; S.folders = new Map();
    const petugas = ['IQBAL', 'DEWI', 'BAGAS'], rooms = ['PATOK-A', 'PATOK-B'];
    rooms.forEach((room, ri) => petugas.forEach((p, pi) => {
      S.folders.set(room + '/' + p, { node: null, edit: {} });
      for (let i = 1; i <= 6; i++) {
        const n = ri * 100 + pi * 10 + i;
        S.rows.push({ key: `${room}/${p}/${n}`, f: `${room}_${p}_${String(i).padStart(3, '0')}.jpg`, room, petugas: p, folder: room + '/' + p,
          no: i, lat: -7.8 + ri * .05 + pi * .02 + i * .004, lon: 110.4 + pi * .03 + i * .006, catatan: i % 2 ? 'Patok batas ' + n : '',
          ts: Date.now() - n * 3600e3, th: thumbPalsu(n), node: null, diedit: false,
          asli: { no: i, lat: -7.8 + ri * .05 + pi * .02 + i * .004, lon: 110.4 + pi * .03 + i * .006, catatan: i % 2 ? 'Patok batas ' + n : '' } });
      }
    }));
  }

  /* ---------------- mulai ---------------- */
  (async function mulai() {
    if (/[?&]demo\b/.test(location.search)) { S.demo = true; window.__uji = { bacaExifTeks, tsDariExif, bikinThumb }; await bukaApp('Mode demo'); return; }
    if (await pulihkanSesi()) await bukaApp();
  })();
})();
