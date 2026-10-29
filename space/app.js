/* spacedkpoint — kelola tabel, galeri, dan peta DKPoint dari desktop.
 * Login memakai akun MEGA yang sama dengan di HP. Tidak ada server: browser berbicara
 * langsung ke MEGA. Struktur data (dibuat oleh aplikasi HP):
 *   DKPOINT_DOKUMENTASI / <ROOM> / <PETUGAS> / ROOM_USER_NNN_LAT_LON.jpg
 *                                             / _indeks.json   (ditulis HP: no, koordinat, catatan, waktu, thumbnail)
 *                                             / _edit.json     (ditulis space: koreksi no, koordinat, catatan)
 *   DKPOINT_DOKUMENTASI / _peta / *.kml        (ditulis space; sinkron ke HP menyusul)
 */
(function () {
  'use strict';
  const FOLDER_MASTER = 'DKPOINT_DOKUMENTASI';
  const KUNCI_SESI = 'space_sesi_v1';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const S = {
    storage: null, demo: false, master: null,
    rows: [], folders: new Map(),            // folders: kunci "ROOM/PETUGAS" -> {node, edit:{}}
    f: { room: '', petugas: '', q: '' }, urut: { k: 'ts', turun: true },
    tab: 'tabel', sedangEdit: null, kml: [], blobFoto: new Map()
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
      const st = new mega.Storage(opsi);
      await st.ready;
      S.storage = st;
      simpanSesi(st, $('ingat').checked);
      $('sandi').value = '';
      await bukaApp(opsi.email);
    } catch (e) {
      const m = pesanMega(e);
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

  async function muatData(paksa) {
    status('Membaca folder MEGA…');
    try {
      if (S.demo) { demoData(); }
      else {
        if (paksa) { try { await S.storage.reload(true); } catch (_) { await S.storage.reload(); } }
        S.master = S.storage.find(FOLDER_MASTER);
        if (!S.master) { S.rows = []; status('Folder ' + FOLDER_MASTER + ' belum ada di akun ini. Unggah foto dari HP dulu.'); isiFilter(); render(); return; }
        await bacaFolder();
      }
      isiFilter(); render();
      status(S.rows.length + ' foto dimuat.');
      if (S.tab === 'peta') pastikanPeta();
    } catch (e) { status('Gagal membaca MEGA: ' + (e.message || e), true); }
  }

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
      const nodeEdit = anak.find(n => !n.directory && n.name === '_edit.json');
      let idx = {}, edit = {};
      if (nodeIdx) { try { (await bacaJson(nodeIdx)).foto.forEach(x => idx[x.f] = x); } catch (_) {} }
      if (nodeEdit) { try { edit = (await bacaJson(nodeEdit)).e || {}; } catch (_) {} }
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
      });
    });
    S.rows = rows;
  }

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
      return `<tr data-key="${esc(r.key)}"><td${d}>${esc(r.no == null ? '' : r.no)}</td><td>${esc(r.room)}</td><td>${esc(r.petugas)}</td>
        <td>${angka(r.lat)}</td><td>${angka(r.lon)}</td><td>${esc(waktu(r.ts))}</td>
        <td class="catatan">${esc(r.catatan)}</td>
        <td>${r.th ? `<img class="th" data-aksi="foto" src="${r.th}" alt="">` : `<button data-aksi="foto">Lihat</button>`}</td>
        <td><button data-aksi="edit">Edit</button></td></tr>`;
    }).join('') || '<tr><td colspan="9" class="kecil">Belum ada data.</td></tr>';
    if (data.length > 1500) status('Menampilkan 1500 baris pertama; persempit dengan filter.');
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

  async function simpanEdit(r, tr) {
    const val = f => tr.querySelector(`[data-f="${f}"]`).value.trim();
    const num = (t, lo, hi) => { if (t === '') return null; const v = Number(t.replace(',', '.')); return isFinite(v) && v >= lo && v <= hi ? v : NaN; };
    const no = num(val('no'), 0, 99999), lat = num(val('lat'), -90, 90), lon = num(val('lon'), -180, 180), cat = val('catatan').slice(0, 250);
    if ([no, lat, lon].some(Number.isNaN)) { status('Nilai tidak valid. Nomor harus angka; latitude -90..90; longitude -180..180.', true); return; }
    const e = {};
    if (no !== r.asli.no) e.no = no;
    if (lat !== r.asli.lat) e.lat = lat;
    if (lon !== r.asli.lon) e.lon = lon;
    if (cat !== (r.asli.catatan || '')) e.c = cat;
    const fol = S.folders.get(r.folder);
    status('Menyimpan…');
    try {
      const baru = Object.assign({}, fol.edit);
      if (Object.keys(e).length) baru[r.f] = e; else delete baru[r.f];
      if (!S.demo) await tulisJson(fol.node, '_edit.json', { v: 1, e: baru, oleh: 'spacedkpoint', ts: Date.now() });
      fol.edit = baru;
      r.no = no; r.lat = lat; r.lon = lon; r.catatan = cat; r.diedit = Object.keys(e).length > 0;
      S.sedangEdit = null; renderTabel(); status('Tersimpan.');
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
    $('grid').innerHTML = data.map(r => `<div class="sel" data-key="${esc(r.key)}">
      <div class="gbr">${r.th ? `<img src="${r.th}" alt="" loading="lazy">` : 'Tanpa thumbnail'}</div>
      <div class="ket"><b>${esc(r.room)} · ${esc(r.no == null ? '–' : r.no)}</b><span>${esc(r.petugas)}</span><span>${esc(r.catatan || '')}</span></div></div>`).join('') || '<p class="kecil">Belum ada foto.</p>';
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
    daftarLapisan();
  }

  function daftarLapisan() {
    const ul = $('daftarLapisan');
    const foto = `<li><div class="baris"><label><input type="checkbox" id="cbFoto" ${peta && peta.hasLayer(lapisFoto) ? 'checked' : ''}> Titik foto (${lapisFoto ? lapisFoto.getLayers().length : 0})</label></div></li>`;
    ul.innerHTML = foto + S.kml.map((k, i) => `<li data-i="${i}"><div class="baris">
      <label title="${esc(k.nama)}"><input type="checkbox" data-a="aktif" ${k.aktif ? 'checked' : ''}> <span style="color:${k.warna}">●</span> ${esc(k.nama)}</label>
      <button class="mini" data-a="zoom" title="Perbesar ke lapisan">⌖</button><button class="mini" data-a="hapus" title="Hapus">✕</button></div>
      <input type="range" data-a="opa" min="0.1" max="1" step="0.1" value="${k.opa}" title="Transparansi"></li>`).join('');
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
    if (/[?&]demo\b/.test(location.search)) { S.demo = true; await bukaApp('Mode demo'); return; }
    if (await pulihkanSesi()) await bukaApp();
  })();
})();
