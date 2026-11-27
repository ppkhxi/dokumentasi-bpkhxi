/* Studio Video — gabungkan klip Video Kegiatan (maks 10 detik) menjadi satu video
 * utuh dengan teks, backsound, dan pilihan rasio. Render memakai ffmpeg.wasm
 * (single-thread, tanpa SharedArrayBuffer) sehingga berjalan di hosting statis.
 *
 * Alur render:
 *   1) tiap klip dipotong (trim), diskalakan ke rasio, teks klip dibakar  -> pN.mp4
 *   2) concat demuxer menyambung semua pN.mp4 tanpa encode ulang         -> gabung.mp4
 *   3) judul pembuka/penutup + backsound dicampur pada hasil akhir       -> hasil.mp4
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const ctx = () => window.SpaceCtx || {};
  const status = (t, g) => { const c = ctx(); if (c.status) c.status(t, g); else if (t) console.log(t); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const angka = v => (isFinite(v) && v > 0 ? v : 0).toFixed(1).replace(/\.0$/, '');
  const detik = v => {
    v = Math.max(0, Number(v) || 0);
    return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(Math.floor(v % 60)).padStart(2, '0');
  };
  const tglJam = ts => ts ? new Date(ts).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '–';

  const BARU = { trimAwal: 0, trimAkhir: 0, teks: '', posisi: 'bawah', warna: '#ffffff' };
  const ST = {
    cloud: null, muat: false, pilih: [], terpilih: null, backsound: null,
    ff: null, memuatFF: null, log: [], renderJalan: false,
    putar: false, pos: 0, idx: -1, geserIdx: null, temp: []
  };

  /* ---------------- util ---------------- */
  function skrip(url) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = res; s.onerror = () => rej(new Error('Gagal memuat ' + url));
      document.head.appendChild(s);
    });
  }
  async function blobUrl(url, tipe) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Gagal mengunduh ' + url + ' (' + r.status + ')');
    return URL.createObjectURL(new Blob([await r.arrayBuffer()], { type: tipe }));
  }
  function ukuranTeks(b) {
    if (!b) return '0 MB';
    return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  }

  /* ---------------- daftar klip dari MEGA ---------------- */
  async function muatDaftar() {
    const c = ctx();
    ST.cloud = [];
    if (!c.storage || !c.master) { ST.muat = true; renderDaftar(); return; }
    status('Membaca folder VIDEO tiap room…');
    const rooms = (c.master.children || []).filter(n => n.directory && !n.name.startsWith('_'));
    for (const room of rooms) {
      const fv = (room.children || []).find(n => n.directory && n.name === 'VIDEO');
      if (!fv) continue;
      let idx = {};
      const nodeIdx = (fv.children || []).find(n => !n.directory && n.name === '_video.json');
      if (nodeIdx) {
        try {
          const j = JSON.parse(new TextDecoder().decode(await nodeIdx.downloadBuffer()));
          (j.video || []).forEach(x => { if (x && x.f) idx[x.f] = x; });
        } catch (_) { /* indeks opsional */ }
      }
      (fv.children || []).filter(n => n.directory && n.name !== 'HASIL').forEach(p => {
        (p.children || []).filter(n => !n.directory && /\.(mp4|m4v|mov|webm)$/i.test(n.name)).forEach(n => {
          const i = idx[n.name] || {};
          ST.cloud.push({
            id: 'c:' + room.name + '/' + p.name + '/' + n.name,
            room: room.name, petugas: p.name, nama: n.name, node: n, sumber: 'cloud',
            ukuran: Number(n.size || i.uk || 0), durasi: Number(i.d || 0),
            ts: Number(i.ts || (n.timestamp ? n.timestamp * 1000 : 0))
          });
        });
      });
    }
    ST.cloud.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    ST.muat = true;
    renderDaftar();
    status(ST.cloud.length ? ST.cloud.length + ' klip video di cloud.' : 'Belum ada klip video di cloud. Rekam dari aplikasi HP lalu muat ulang.');
  }

  function renderDaftar() {
    const box = $('stDaftarKlip'); if (!box) return;
    const c = ctx();
    if (!ST.cloud || !ST.cloud.length) {
      box.innerHTML = '<p class="kecil" style="margin:0">' + (c.demo ? 'Mode demo: tambahkan video dari komputer.' : 'Belum ada klip di folder VIDEO room.') + '</p>';
      return;
    }
    const per = new Map();
    ST.cloud.forEach(k => { if (!per.has(k.room)) per.set(k.room, []); per.get(k.room).push(k); });
    box.innerHTML = Array.from(per).map(([room, list]) =>
      '<div class="stGrup"><b>' + esc(room) + ' <span class="kecil">' + list.length + ' klip</span></b>' +
      list.map(k => {
        const dipakai = ST.pilih.some(p => p.id === k.id);
        return '<button class="stKlip' + (dipakai ? ' dipakai' : '') + '" data-id="' + esc(k.id) + '" title="' + esc(tglJam(k.ts)) + '">' +
          '<span class="stNama">' + esc(k.nama) + '</span>' +
          '<span class="kecil">' + esc(k.petugas) + ' · ' + detik(k.durasi) + ' · ' + ukuranTeks(k.ukuran) + '</span>' +
          (dipakai ? '<span class="stCek">✓</span>' : '') + '</button>';
      }).join('') + '</div>').join('');
    box.querySelectorAll('.stKlip').forEach(b => b.onclick = () => {
      const k = ST.cloud.find(x => x.id === b.dataset.id);
      if (!k) return;
      if (ST.pilih.some(p => p.id === k.id)) { status('Klip ini sudah ada di urutan.'); return; }
      ST.pilih.push(Object.assign({}, k, BARU, { trimAkhir: k.durasi || 0 }));
      ST.terpilih = ST.pilih[ST.pilih.length - 1];
      renderDaftar(); renderPlaylist(); bukaKlip(ST.terpilih);
    });
  }

  /* ---------------- berkas lokal ---------------- */
  function tambahLokal(files) {
    const baru = [];
    Array.from(files || []).forEach(f => {
      const k = {
        id: 'l:' + f.name + ':' + f.size + ':' + (f.lastModified || 0),
        room: 'LOKAL', petugas: 'Lokal', nama: f.name, file: f, sumber: 'lokal',
        ukuran: f.size, durasi: 0, ts: f.lastModified || Date.now()
      };
      Object.assign(k, BARU);
      ST.pilih.push(k);
      ST.terpilih = k;
      baru.push(k);
    });
    renderPlaylist(); renderDaftar();
    if (ST.terpilih) bukaKlip(ST.terpilih);
    // Baca durasi semua berkas lokal supaya total di timeline langsung benar.
    Promise.all(baru.map(k => pastikanDurasi(k))).then(() => { renderPlaylist(); if (ST.terpilih) sinkronForm(); }).catch(() => {});
  }

  /* ---------------- urutan & pratinjau ---------------- */
  const PX_DETIK = 26;
  function durasiKlip(k) { return Math.max(0, (Number(k.trimAkhir) || Number(k.durasi) || 0) - (Number(k.trimAwal) || 0)); }
  function totalDurasi() { return ST.pilih.reduce((a, k) => a + durasiKlip(k), 0); }
  function lebarKlip(d) { return Math.max(72, Math.min(260, Math.round((Number(d) || 1) * PX_DETIK))); }
  function posisiMulai(i) { let a = 0; for (let j = 0; j < i; j++) a += durasiKlip(ST.pilih[j]); return a; }
  function idxTerpilih() { return ST.pilih.indexOf(ST.terpilih); }
  function klipPada(t) {
    let a = 0;
    for (let i = 0; i < ST.pilih.length; i++) {
      const k = ST.pilih[i], d = durasiKlip(k);
      if (t < a + d - 1e-6 || i === ST.pilih.length - 1) {
        return { i, k, mulai: a, dur: d, lokal: (Number(k.trimAwal) || 0) + Math.max(0, Math.min(d, t - a)) };
      }
      a += d;
    }
    return null;
  }
  function perbaruiWaktu() {
    const total = totalDurasi();
    const r = $('stSeqRange');
    if (!r) return;
    r.max = total.toFixed(2);
    r.value = Math.min(total, Math.max(0, ST.pos)).toFixed(2);
    $('stSeqWaktu').textContent = detik(ST.pos) + ' / ' + detik(total);
  }
  function renderPlaylist() {
    const box = $('stTimeline'); if (!box) return;
    if (!ST.pilih.length) {
      box.innerHTML = '<p class="kecil" style="margin:0">Urutan masih kosong. Pilih klip di kiri; urutan di sini menentukan hasil video.</p>';
      $('stTotal').textContent = '0 klip';
      perbaruiWaktu();
      return;
    }
    box.innerHTML = ST.pilih.map((k, i) => {
      const d = durasiKlip(k) || Number(k.durasi) || 0;
      return '<div class="stKlipTL' + (k === ST.terpilih ? ' pilih' : '') + (ST.putar && ST.idx === i ? ' aktif' : '') + '" data-i="' + i + '" draggable="true" style="width:' + lebarKlip(d) + 'px" title="' + esc(k.nama) + '">' +
        (k.thumb ? '<img src="' + esc(k.thumb) + '" alt="" draggable="false">' : '<div class="stTanpaThumb">🎞</div>') +
        '<span class="stDur">' + detik(d) + '</span>' +
        '<span class="stHandle kiri" data-h="awal" title="Tarik untuk memotong awal"></span>' +
        '<span class="stHandle kanan" data-h="akhir" title="Tarik untuk memotong akhir"></span>' +
        '<span class="stInfoTL"><b>' + (i + 1) + '. ' + esc(k.nama) + '</b><span>' + esc(k.teks ? k.teks.slice(0, 24) : (k.room || 'LOKAL')) + '</span></span>' +
        '<span class="stAksiTL">' +
          '<button data-a="kiri" title="Geser ke kiri"' + (i === 0 ? ' disabled' : '') + '>←</button>' +
          '<button data-a="kanan" title="Geser ke kanan"' + (i === ST.pilih.length - 1 ? ' disabled' : '') + '>→</button>' +
          '<button data-a="buang" title="Keluarkan">✕</button></span></div>';
    }).join('');
    const total = totalDurasi();
    $('stTotal').textContent = ST.pilih.length + ' klip · ' + detik(total) + ' · ' + ukuranTeks(ST.pilih.reduce((a, k) => a + (k.ukuran || 0), 0));
    perbaruiWaktu();
  }
  function gantiUrutan(from, to) {
    if (from == null || to == null || from === to || from < 0 || to < 0 || from >= ST.pilih.length || to >= ST.pilih.length) return;
    const [x] = ST.pilih.splice(from, 1);
    ST.pilih.splice(to, 0, x);
    ST.terpilih = x;
    ST.idx = ST.pilih.indexOf(x);
    ST.pos = posisiMulai(ST.idx);
    renderPlaylist(); renderDaftar(); sinkronForm();
  }
  function pilihKlip(i) {
    const k = ST.pilih[i]; if (!k) return;
    jedaSequence();
    ST.terpilih = k; ST.idx = i;
    ST.pos = posisiMulai(i);
    sinkronForm(); renderPlaylist(); renderDaftar(); perbaruiWaktu();
    tampilkanKlip({ i, k, mulai: ST.pos, dur: durasiKlip(k), lokal: Number(k.trimAwal) || 0 }, true);
  }
  function pecahDiPosisi() {
    if (!ST.pilih.length) { status('Tambahkan klip dulu.', true); return; }
    let p = ST.putar ? klipPada(ST.pos) : null;
    if (!p && ST.terpilih) p = { i: idxTerpilih(), k: ST.terpilih, lokal: $('stVideo').currentTime || 0 };
    if (!p || p.i < 0) { status('Pilih klip yang ingin dipecah.', true); return; }
    const k = p.k, a = Number(k.trimAwal) || 0, b = Number(k.trimAkhir) || Number(k.durasi) || 0, lokal = Number(p.lokal) || 0;
    if (lokal - a < 0.3 || b - lokal < 0.3) { status('Posisi pemutar terlalu dekat ujung klip (minimal 0,3 detik).', true); return; }
    const baru = Object.assign({}, k, { id: k.id + '-p' + Date.now(), trimAwal: lokal, trimAkhir: b, teks: '', thumb: k.thumb });
    k.trimAkhir = lokal;
    ST.pilih.splice(p.i + 1, 0, baru);
    jedaSequence();
    ST.terpilih = k; ST.idx = p.i; ST.pos = posisiMulai(p.i);
    renderPlaylist(); renderDaftar(); sinkronForm(); perbaruiWaktu();
    status('Klip dipecah di ' + detik(lokal) + '.');
  }
  async function putarJeda() {
    if (ST.putar) { jedaSequence(); return; }
    if (ST.renderJalan) return;
    if (!ST.pilih.length) { status('Tambahkan klip dulu.', true); return; }
    status('Menyiapkan klip…');
    for (const k of ST.pilih) await pastikanDurasi(k);
    renderPlaylist();
    let mulai = ST.pos;
    const i = idxTerpilih();
    if (i >= 0) {
      const v = $('stVideo'), lokal = Number(v.currentTime) || 0;
      if (v.dataset.klip === ST.terpilih.id && lokal > 0) {
        mulai = posisiMulai(i) + Math.max(0, lokal - (Number(ST.terpilih.trimAwal) || 0));
      }
    }
    mainkanDari(mulai >= totalDurasi() - 0.05 ? 0 : mulai);
  }
  function buangTerpilih() {
    const i = idxTerpilih();
    if (i < 0) { status('Pilih klip yang ingin dikeluarkan.', true); return; }
    jedaSequence();
    const [x] = ST.pilih.splice(i, 1);
    ST.terpilih = ST.pilih[Math.min(i, ST.pilih.length - 1)] || null;
    ST.idx = ST.terpilih ? idxTerpilih() : -1;
    ST.pos = ST.terpilih ? posisiMulai(ST.idx) : 0;
    renderPlaylist(); renderDaftar(); sinkronForm(); perbaruiWaktu();
    if (ST.terpilih) {
      const p = klipPada(ST.pos);
      if (p) tampilkanKlip(p, false);
    } else {
      $('stTotal').textContent = '0 klip';
      $('stVideo').removeAttribute('src');
      $('stVideo').removeAttribute('data-klip');
      tampilTeksPratinjau(null);
    }
    status('Klip dikeluarkan: ' + x.nama);
  }
  function langkahFrame(arah) {
    if (!ST.pilih.length) return;
    jedaSequence();
    let t = ST.pos;
    const i = idxTerpilih();
    if (i >= 0) {
      const v = $('stVideo'), lokal = Number(v.currentTime) || 0;
      if (v.dataset.klip === ST.terpilih.id && lokal > 0) {
        t = posisiMulai(i) + Math.max(0, lokal - (Number(ST.terpilih.trimAwal) || 0));
      }
    }
    t = Math.max(0, Math.min(totalDurasi(), t + arah / 30));
    ST.pos = t;
    perbaruiWaktu();
    const p = klipPada(t);
    if (p) tampilkanKlip(p, false);
  }

  let seqToken = 0;
  function jedaSequence() {
    const v = $('stVideo');
    const sedang = ST.putar;
    ST.putar = false;
    seqToken++;   // batalkan pemuatan klip yang masih berjalan
    if (v) v.pause();
    if (sedang) { $('stPutar').textContent = '▶'; renderPlaylist(); }
  }
  async function siapkanUrl(k) {
    if (k.url) return k.url;
    const bytes = await bytesKlip(k);
    k.url = URL.createObjectURL(new Blob([bytes], { type: /\.webm$/i.test(k.nama) ? 'video/webm' : 'video/mp4' }));
    return k.url;
  }
  async function buatThumb(k) {
    if (!k || k.thumb || k.thumbJalan) return;
    k.thumbJalan = true;
    try {
      await siapkanUrl(k);
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = k.url;
      await new Promise(res => { v.onloadeddata = res; v.onerror = res; setTimeout(res, 4000); });
      const target = Math.max(0, Math.min((Number(k.trimAwal) || 0) + 0.12, (v.duration || 1) - 0.1));
      await new Promise(res => { v.onseeked = res; try { v.currentTime = target; } catch (_) { res(); } setTimeout(res, 2500); });
      const c = document.createElement('canvas'); c.width = 160; c.height = 90;
      const g = c.getContext('2d');
      const vw = v.videoWidth || 160, vh = v.videoHeight || 90;
      const skala = Math.max(160 / vw, 90 / vh);
      g.drawImage(v, (160 - vw * skala) / 2, (90 - vh * skala) / 2, vw * skala, vh * skala);
      k.thumb = c.toDataURL('image/jpeg', 0.62);
    } catch (_) { /* thumbnail opsional */ }
    k.thumbJalan = false;
  }
  async function tampilkanKlip(p, autoplay) {
    const token = ++seqToken;
    const k = p.k;
    ST.idx = p.i; ST.terpilih = k;
    sinkronForm();
    try {
      const url = await siapkanUrl(k);
      if (token !== seqToken) return false;
      const v = $('stVideo');
      if (v.dataset.klip !== k.id) {
        v.dataset.klip = k.id;
        v.src = url;
        await new Promise(res => {
          const selesai = () => { v.removeEventListener('loadedmetadata', selesai); res(); };
          v.addEventListener('loadedmetadata', selesai);
          setTimeout(res, 4000);
        });
        if (token !== seqToken) return false;
      }
      if (isFinite(v.duration) && v.duration > 0) {
        if (!k.durasi) k.durasi = v.duration;
        if (!k.trimAkhir || k.trimAkhir > k.durasi) k.trimAkhir = k.durasi;
        sinkronForm(); renderPlaylist(); perbaruiWaktu();
      }
      try { v.currentTime = Math.max(0, Math.min(p.lokal, (v.duration || p.lokal || 0) - 0.03)); } catch (_) {}
      tampilTeksPratinjau(k);
      renderPlaylist();
      buatThumb(k).then(() => { if (ST.terpilih === k) renderPlaylist(); });
      if (autoplay) await v.play().catch(() => {});
      return true;
    } catch (e) {
      status('Klip tidak bisa diputar: ' + (e.message || e), true);
      return false;
    }
  }
  async function mainkanDari(t) {
    const total = totalDurasi();
    if (!total) return;
    if (t >= total - 0.05) t = 0;
    const p = klipPada(t);
    if (!p) return;
    ST.putar = true;
    $('stPutar').textContent = '⏸';
    ST.pos = t;
    perbaruiWaktu();
    const ok = await tampilkanKlip(p, true);
    if (!ok) jedaSequence();
  }

  async function bytesKlip(k) {
    // Salinan baru setiap kali: ffmpeg.wasm memindahkan (detach) buffer ke worker,
    // jadi buffer yang sama tidak bisa dipakai untuk render kedua.
    if (!k.isi) {
      if (k.file) k.isi = await k.file.arrayBuffer();
      else if (k.node) {
        status('Mengunduh ' + k.nama + '…');
        const buf = await k.node.downloadBuffer();
        k.isi = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      } else throw new Error('Berkas ' + k.nama + ' tidak tersedia');
    }
    return new Uint8Array(k.isi.slice(0));
  }

  // Durasi dibaca dari berkas bila belum diketahui (klip lokal / indeks lama tanpa durasi).
  async function pastikanDurasi(k) {
    if (k.durasi) return k.durasi;
    try {
      if (!k.url) {
        const bytes = await bytesKlip(k);
        k.url = URL.createObjectURL(new Blob([bytes], { type: /\.webm$/i.test(k.nama) ? 'video/webm' : 'video/mp4' }));
      }
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.src = k.url;
      await new Promise(res => { v.onloadedmetadata = res; v.onerror = res; setTimeout(res, 5000); });
      k.durasi = isFinite(v.duration) && v.duration > 0 ? v.duration : 10;
    } catch (_) { k.durasi = 10; }
    if (!k.trimAkhir || k.trimAkhir > k.durasi) k.trimAkhir = k.durasi;
    return k.durasi;
  }

  async function bukaKlip(k) {
    if (!k) return;
    sinkronForm();
    const v = $('stVideo');
    try {
      const url = await siapkanUrl(k);
      if (v.dataset.klip !== k.id) { v.dataset.klip = k.id; v.src = url; }
      v.onloadedmetadata = () => {
        if (!isFinite(v.duration)) return;
        if (!k.durasi) { k.durasi = v.duration; renderPlaylist(); renderDaftar(); }
        if (!k.trimAkhir) k.trimAkhir = v.duration;
        sinkronForm(); perbaruiWaktu();
      };
      try { v.currentTime = k.trimAwal || 0; } catch (_) {}
      v.play().catch(() => {});
      tampilTeksPratinjau(k);
      buatThumb(k).then(() => renderPlaylist());
    } catch (e) { status('Klip tidak bisa dibuka: ' + (e.message || e), true); }
  }

  function tampilTeksPratinjau(k) {
    const t = $('stTeksPratinjau');
    t.textContent = k && k.teks ? k.teks : '';
    t.className = 'stTeksPratinjau ' + ((k && k.posisi) || 'bawah');
    t.style.color = (k && k.warna) || '#ffffff';
    t.style.display = k && k.teks ? 'block' : 'none';
  }

  function sinkronForm() {
    const k = ST.terpilih;
    const nonaktif = !k;
    ['stAwal', 'stAkhir', 'stTeksKlip', 'stPosisiTeks', 'stWarnaTeks', 'stTandaiAwal', 'stTandaiAkhir'].forEach(id => { const el = $(id); if (el) el.disabled = nonaktif; });
    if (!k) {
      $('stNamaKlip').textContent = 'Belum ada klip terpilih';
      $('stAwal').value = 0; $('stAkhir').value = 0; $('stTeksKlip').value = '';
      tampilTeksPratinjau(null);
      return;
    }
    $('stNamaKlip').textContent = k.nama + ' · ' + detik(k.durasi);
    $('stAwal').value = angka(k.trimAwal);
    $('stAwal').max = angka(k.durasi || 0);
    $('stAkhir').value = angka(k.trimAkhir || k.durasi);
    $('stAkhir').max = angka(k.durasi || 0);
    $('stTeksKlip').value = k.teks || '';
    $('stPosisiTeks').value = k.posisi || 'bawah';
    $('stWarnaTeks').value = k.warna || '#ffffff';
    tampilTeksPratinjau(k);
  }

  function bacaForm() {
    const k = ST.terpilih; if (!k) return;
    jedaSequence();
    const a = Math.max(0, Number($('stAwal').value) || 0);
    const b = Math.max(0, Number($('stAkhir').value) || 0);
    k.trimAwal = Math.min(a, Math.max(0, (k.durasi || b) - 0.3));
    k.trimAkhir = Math.min(b || k.durasi, k.durasi || b || 0);
    if (k.trimAkhir - k.trimAwal < 0.3) k.trimAkhir = Math.min(k.durasi || (k.trimAwal + 0.3), k.trimAwal + 0.3);
    k.teks = $('stTeksKlip').value.trim();
    k.posisi = $('stPosisiTeks').value;
    k.warna = $('stWarnaTeks').value;
    tampilTeksPratinjau(k);
    renderPlaylist(); renderDaftar();
    const i = idxTerpilih();
    if (i >= 0) ST.pos = posisiMulai(i);
    perbaruiWaktu();
  }

  /* ---------------- ffmpeg.wasm ---------------- */
  // ffmpeg.wasm 0.12 + core single-thread (tanpa SharedArrayBuffer, aman tanpa COOP/COEP).
  // Worker bawaan build UMD berada di chunk CDN terpisah; karena worker lintas-origin
  // ditolak browser, chunk itu diunduh dan dijadikan blob URL lokal saat diperlukan.
  const URL_FF = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js';
  // classWorkerURL memaksa worker bertipe modul, jadi inti ffmpeg harus versi ESM.
  const URL_CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js';
  const URL_WASM = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm';
  const URL_WORKER = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js';

  async function siapkanFF() {
    if (ST.ff) return ST.ff;
    if (ST.memuatFF) return ST.memuatFF;
    ST.memuatFF = (async () => {
      progres('Menyiapkan mesin render… (unduhan ±32 MB, sekali saja)');
      if (!window.FFmpegWASM || !window.FFmpegWASM.FFmpeg) await skrip(URL_FF);
      if (!window.FFmpegWASM || !window.FFmpegWASM.FFmpeg) throw new Error('Pustaka ffmpeg.wasm gagal dimuat dari CDN');
      const buat = () => {
        const inst = new window.FFmpegWASM.FFmpeg();
        ST.log = [];
        inst.on('log', ({ message }) => {
          ST.log.push(message);
          if (ST.log.length > 600) ST.log.shift();
          uraiKemajuan(message);
        });
        return inst;
      };
      let ff = buat();
      try {
        const worker = await blobUrl(URL_WORKER, 'text/javascript');
        await ff.load({ coreURL: URL_CORE, wasmURL: URL_WASM, classWorkerURL: worker });
      } catch (e) {
        const m = /Script at '([^']+)'/.exec(String((e && e.message) || e));
        progres('Menyiapkan ulang mesin render…');
        ff = buat();
        const worker = await blobUrl(m ? m[1] : URL_WORKER, 'text/javascript');
        await ff.load({ coreURL: URL_CORE, wasmURL: URL_WASM, classWorkerURL: worker });
      }
      ST.ff = ff;
      progres('');
      return ff;
    })();
    try { return await ST.memuatFF; }
    catch (e) { ST.memuatFF = null; throw e; }
  }

  let targetProgres = 0, capaianProgres = 0;
  function progres(t, galat) {
    const el = $('stProgres'); if (!el) return;
    el.textContent = t || '';
    el.className = 'stProgres' + (galat ? ' galat' : '');
  }
  function uraiKemajuan(m) {
    const c = /time=(\d+):(\d+):(\d+\.?\d*)/.exec(m || '');
    if (!c || !targetProgres) return;
    capaianProgres = (+c[1]) * 3600 + (+c[2]) * 60 + (+c[3]);
    const persen = Math.min(99, Math.round((capaianProgres / targetProgres) * 100));
    progres('Merender… ' + persen + '% (' + detik(capaianProgres) + ' / ' + detik(targetProgres) + ')');
  }

  /* ---------------- perintah filter ---------------- */
  const RASIO = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };
  function ukuranRasio() {
    const r = $('stRasio').value || '16:9';
    const [W, H] = RASIO[r] || RASIO['16:9'];
    return { W, H };
  }
  function posisiY(pos, H) {
    if (pos === 'atas') return 'h*0.08';
    if (pos === 'tengah') return '(h-text_h)/2';
    return 'h-text_h-h*0.08';
  }
  function warnaFF(hex) { return '0x' + String(hex || '#ffffff').replace('#', '').toUpperCase(); }
  function drawtext({ file, fontsize, pos, warna, H, dari, sampai }) {
    return 'drawtext=fontfile=font.ttf:textfile=' + file +
      ':fontcolor=' + warnaFF(warna) + ':fontsize=' + fontsize +
      ':box=1:boxcolor=black@0.45:boxborderw=' + Math.round(fontsize * 0.35) +
      ':line_spacing=' + Math.round(fontsize * 0.18) +
      ':x=(w-text_w)/2:y=' + posisiY(pos, H) +
      ':enable=\'between(t,' + dari.toFixed(3) + ',' + sampai.toFixed(3) + ')\'';
  }

  async function punyaAudio(ff, nama) {
    ST.log = [];
    try { await ff.exec(['-hide_banner', '-i', nama]); } catch (_) { /* keluar bukan nol: wajar */ }
    return ST.log.some(l => /Stream #\d+:\d+.*Audio:/.test(l));
  }

  /* ---------------- render ---------------- */
  async function renderSekali(ff, pakaiMusik) {
    const { W, H } = ukuranRasio();
    const total = totalDurasi();
    const judul = $('stJudul').value.trim();
    const penutup = $('stPenutup').value.trim();
    const volKlip = (Number($('stVolKlip').value) || 100) / 100;
    const volMusik = (Number($('stVol').value) || 35) / 100;
    const args = ['-y'];
    const graf = [];
    let inputIdx = 0;

    const font = await fetch('js/Roboto-Regular.ttf');
    if (!font.ok) throw new Error('Font teks tidak ditemukan (js/Roboto-Regular.ttf)');
    await ff.writeFile('font.ttf', new Uint8Array(await font.arrayBuffer()));
    ST.temp.push('font.ttf');

    for (let i = 0; i < ST.pilih.length; i++) {
      const k = ST.pilih[i];
      const D = Math.max(0.3, durasiKlip(k));
      const bytes = await bytesKlip(k);
      const ext = /\.webm$/i.test(k.nama) ? '.webm' : '.mp4';
      const masuk = 'in' + i + ext;
      await ff.writeFile(masuk, bytes);
      ST.temp.push(masuk);
      args.push('-ss', String(Number(k.trimAwal) || 0), '-t', String(D), '-i', masuk);
      const vIdx = inputIdx++;
      let aIdx;
      if (await punyaAudio(ff, masuk)) {
        aIdx = vIdx;              // audio menempel pada berkas yang sama
      } else {
        args.push('-f', 'lavfi', '-t', String(D), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
        aIdx = inputIdx++;        // input terpisah untuk audio senyap
      }
      let vf = '[' + vIdx + ':v]scale=' + W + ':' + H + ':force_original_aspect_ratio=increase,crop=' + W + ':' + H + ',setsar=1,fps=30,format=yuv420p,setpts=PTS-STARTPTS';
      if (k.teks) {
        const tf = 'teks' + i + '.txt';
        await ff.writeFile(tf, new TextEncoder().encode(k.teks));
        ST.temp.push(tf);
        vf += ',' + drawtext({ file: tf, fontsize: Math.round(W * 0.038), pos: k.posisi, warna: k.warna, H, dari: 0, sampai: D });
      }
      vf += '[v' + i + ']';
      graf.push(vf);
      graf.push('[' + aIdx + ':a]volume=' + volKlip.toFixed(2) + ',aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,atrim=0:' + D + '[a' + i + ']');
    }

    graf.push(ST.pilih.map((_, i) => '[v' + i + '][a' + i + ']').join('') + 'concat=n=' + ST.pilih.length + ':v=1:a=1[gabungv][gabunga]');
    let vout = 'gabungv', aout = 'gabunga';
    if (judul) {
      await ff.writeFile('judul.txt', new TextEncoder().encode(judul));
      ST.temp.push('judul.txt');
      graf.push('[gabungv]' + drawtext({ file: 'judul.txt', fontsize: Math.round(W * 0.05), pos: 'atas', warna: '#ffffff', H, dari: 0, sampai: Math.min(4, Math.max(1.5, total * 0.25)) }) + '[vjudul]');
      vout = 'vjudul';
    }
    if (penutup) {
      await ff.writeFile('penutup.txt', new TextEncoder().encode(penutup));
      ST.temp.push('penutup.txt');
      const mulai = Math.max(0, total - Math.min(4.5, Math.max(2, total * 0.25)));
      graf.push('[' + vout + ']' + drawtext({ file: 'penutup.txt', fontsize: Math.round(W * 0.042), pos: 'bawah', warna: '#ffffff', H, dari: mulai, sampai: total }) + '[vpenutup]');
      vout = 'vpenutup';
    }
    if (pakaiMusik && ST.backsound) {
      const ekst = (/\.(\w+)$/.exec(ST.backsound.name) || [, 'mp3'])[1].toLowerCase();
      const mf = 'musik.' + ekst;
      await ff.writeFile(mf, new Uint8Array(await ST.backsound.arrayBuffer()));
      ST.temp.push(mf);
      args.push('-stream_loop', '-1', '-i', mf);
      const mIdx = inputIdx++;
      graf.push('[' + mIdx + ':a]volume=' + volMusik.toFixed(2) + ',afade=t=in:st=0:d=1.2,afade=t=out:st=' + Math.max(0, total - 2).toFixed(2) + ':d=2[musik]');
      graf.push('[gabunga][musik]amix=inputs=2:duration=first:dropout_transition=3[aout]');
      aout = 'aout';
    }

    args.push('-filter_complex', graf.join(';'), '-map', '[' + vout + ']', '-map', '[' + aout + ']',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', String(total), 'hasil.mp4');
    ST.temp.push('hasil.mp4');
    const kode = await ff.exec(args);
    if (kode !== 0) {
      console.error('ffmpeg gagal:', ST.log.slice(-12));
      throw new Error('Render gagal (kode ' + kode + '). Coba kurangi jumlah klip atau backsound.');
    }
  }

  async function render() {
    if (ST.renderJalan) return;
    if (!ST.pilih.length) { status('Tambahkan klip dulu sebelum menggabungkan.', true); return; }
    if (ST.pilih.length > 30) { status('Maksimal 30 klip per render. Bagi menjadi beberapa video.', true); return; }
    ST.renderJalan = true;
    $('stRender').disabled = true;
    jedaSequence();
    const c = ctx();
    ST.temp = [];
    let ff = null;
    let hasilNama = '';
    try {
      ff = await siapkanFF();
      for (const k of ST.pilih) await pastikanDurasi(k);
      renderPlaylist();
      targetProgres = totalDurasi();
      capaianProgres = 0;
      progres('Merender ' + ST.pilih.length + ' klip dalam satu proses…');
      const musikAwal = !!ST.backsound;
      try {
        await renderSekali(ff, musikAwal);
      } catch (e) {
        if (musikAwal) {
          progres('Backsound gagal diproses — mencoba tanpa backsound…');
          for (const n of ST.temp) await ff.deleteFile(n).catch(() => {});
          ST.temp = [];
          await renderSekali(ff, false);
        } else throw e;
      }

      const data = await ff.readFile('hasil.mp4');
      const blob = new Blob([data.buffer ? data : new Uint8Array(data)], { type: 'video/mp4' });
      const cap = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const room = (ctx().roomDipilih ? ctx().roomDipilih() : '') || 'UMUM';
      hasilNama = 'GABUNGAN_' + room.replace(/[^\w-]/g, '') + '_' + cap + '.mp4';
      if (ctx().unduh) ctx().unduh(hasilNama, blob, 'video/mp4');
      else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = hasilNama; a.click();
      }

      if ($('stSimpanCloud').checked && !ctx().demo) {
        try {
          progres('Menyimpan hasil ke cloud…');
          const roomNode = (ctx().master.children || []).find(n => n.directory && n.name === room);
          let fv = roomNode && (roomNode.children || []).find(n => n.directory && n.name === 'VIDEO');
          if (!fv && roomNode) fv = await ctx().storage.mkdir({ name: 'VIDEO', target: roomNode });
          let fh = fv && (fv.children || []).find(n => n.directory && n.name === 'HASIL');
          if (!fh && fv) fh = await ctx().storage.mkdir({ name: 'HASIL', target: fv });
          if (fh) {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            const lama = (fh.children || []).find(n => !n.directory && n.name === hasilNama);
            await ctx().unggahNode(fh, hasilNama, bytes);
            if (lama) { try { await lama.delete(true); } catch (_) {} }
          }
        } catch (e) { status('Video jadi, tetapi gagal disimpan ke cloud: ' + (e.message || e), true); }
      }
      progres('Selesai: ' + hasilNama + ' (' + ukuranTeks(blob.size) + ', ' + detik(totalDurasi()) + ')');
      status('Video selesai dibuat: ' + hasilNama);
    } catch (e) {
      console.error('Render video gagal:', e);
      progres('Gagal: ' + (e.message || e), true);
      status('Render video gagal: ' + (e.message || e), true);
    } finally {
      if (ff) for (const n of ST.temp) await ff.deleteFile(n).catch(() => {});
      ST.temp = [];
      ST.renderJalan = false;
      $('stRender').disabled = false;
    }
  }

  /* ---------------- pemasangan kendali ---------------- */
  function pasangTimeline() {
    const box = $('stTimeline'); if (!box) return;
    let baruGeser = 0;

    box.addEventListener('click', e => {
      const el = e.target.closest('.stKlipTL'); if (!el) return;
      const i = +el.dataset.i; const k = ST.pilih[i]; if (!k) return;
      const b = e.target.closest('button[data-a]');
      if (b) {
        e.preventDefault(); e.stopPropagation();
        if (b.dataset.a === 'buang') {
          const [x] = ST.pilih.splice(i, 1);
          if (ST.terpilih === x) { ST.terpilih = ST.pilih[Math.min(i, ST.pilih.length - 1)] || null; ST.idx = idxTerpilih(); }
          renderPlaylist(); renderDaftar();
          if (ST.terpilih) { sinkronForm(); ST.pos = posisiMulai(idxTerpilih()); perbaruiWaktu(); }
          else { $('stTotal').textContent = '0 klip'; tampilTeksPratinjau(null); }
        } else {
          gantiUrutan(i, b.dataset.a === 'kiri' ? i - 1 : i + 1);
        }
        return;
      }
      if (e.target.closest('.stHandle')) return;
      if (Date.now() - baruGeser < 350) return;
      pilihKlip(i);
    });

    let geser = null;
    box.addEventListener('pointerdown', e => {
      const h = e.target.closest('.stHandle'); if (!h) return;
      const el = h.closest('.stKlipTL'); if (!el) return;
      const i = +el.dataset.i; const k = ST.pilih[i]; if (!k) return;
      e.preventDefault();
      if (ST.putar) { ST.putar = false; $('stPutar').textContent = '▶'; $('stVideo').pause(); }
      ST.terpilih = k; ST.idx = i; sinkronForm();
      box.querySelectorAll('.stKlipTL.pilih').forEach(x => x.classList.remove('pilih'));
      el.classList.add('pilih');
      try { h.setPointerCapture(e.pointerId); } catch (_) {}
      geser = { i, sisi: h.dataset.h, x0: e.clientX, a0: Number(k.trimAwal) || 0, b0: Number(k.trimAkhir) || Number(k.durasi) || 0, el, k };
      ST.pos = posisiMulai(i); perbaruiWaktu();
    });
    box.addEventListener('pointermove', e => {
      if (!geser) return;
      const k = geser.k;
      const dt = (e.clientX - geser.x0) / PX_DETIK;
      if (geser.sisi === 'awal') {
        k.trimAwal = Math.round(Math.max(0, Math.min(geser.b0 - 0.3, geser.a0 + dt)) * 10) / 10;
      } else {
        const maks = Number(k.durasi) || geser.b0;
        k.trimAkhir = Math.round(Math.min(maks, Math.max(geser.a0 + 0.3, geser.b0 + dt)) * 10) / 10;
      }
      const d = durasiKlip(k);
      geser.el.style.width = lebarKlip(d) + 'px';
      const durEl = geser.el.querySelector('.stDur'); if (durEl) durEl.textContent = detik(d);
      $('stAwal').value = angka(k.trimAwal);
      $('stAkhir').value = angka(k.trimAkhir);
      ST.pos = posisiMulai(geser.i);
      $('stSeqRange').max = totalDurasi().toFixed(2);
      perbaruiWaktu();
    });
    const akhiriGeser = () => {
      if (!geser) return;
      const k = geser.k;
      geser = null;
      baruGeser = Date.now();
      const a = Math.max(0, Number(k.trimAwal) || 0);
      const b = Math.min(Number(k.durasi) || Number(k.trimAkhir) || 0, Number(k.trimAkhir) || 0);
      k.trimAwal = Math.min(a, Math.max(0, b - 0.3));
      k.trimAkhir = Math.max(k.trimAwal + 0.3, b);
      bacaForm();
    };
    box.addEventListener('pointerup', akhiriGeser);
    box.addEventListener('pointercancel', akhiriGeser);

    box.addEventListener('dragstart', e => {
      const el = e.target.closest('.stKlipTL'); if (!el) return;
      ST.geserIdx = +el.dataset.i;
      try { e.dataTransfer.setData('text/plain', String(ST.geserIdx)); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
      el.classList.add('geser');
    });
    box.addEventListener('dragover', e => {
      if (ST.geserIdx == null) return;
      const el = e.target.closest('.stKlipTL'); if (!el) return;
      e.preventDefault();
      box.querySelectorAll('.stKlipTL.masuk').forEach(x => x.classList.remove('masuk'));
      el.classList.add('masuk');
    });
    box.addEventListener('drop', e => {
      const el = e.target.closest('.stKlipTL'); if (!el || ST.geserIdx == null) return;
      e.preventDefault();
      const from = ST.geserIdx, to = +el.dataset.i;
      ST.geserIdx = null;
      gantiUrutan(from, to);
    });
    box.addEventListener('dragend', () => {
      ST.geserIdx = null;
      box.querySelectorAll('.geser,.masuk').forEach(x => x.classList.remove('geser', 'masuk'));
    });
  }

  function diKolomTeks(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    if (el.tagName !== 'INPUT') return false;
    return ['text', 'search', 'email', 'password', 'url', 'tel', 'number', 'date', 'time', 'datetime-local', 'month', 'week'].includes((el.type || 'text').toLowerCase());
  }
  function pasangShortcut() {
    document.addEventListener('keydown', e => {
      if (!$('app') || $('app').hidden || !$('vVideo') || $('vVideo').hidden) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (diKolomTeks(e.target)) return;
      if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); putarJeda(); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); pecahDiPosisi(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); buangTerpilih(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.target === $('stSeqRange')) e.target.blur();   // cegah slider ikut melangkah 0,05 dtk
        langkahFrame(e.key === 'ArrowLeft' ? -1 : 1);
      }
    });
  }

  function pasang() {
    $('stFile').onchange = e => {
      const f = Array.from(e.target.files || []);   // salin dulu: mengosongkan input ikut mengosongkan FileList
      e.target.value = '';
      tambahLokal(f);
    };
    $('stMuatUlang').onclick = async () => { ST.muat = false; await muatDaftar(); renderDaftar(); };
    $('stAudio').onchange = e => {
      ST.backsound = e.target.files[0] || null;
      $('stNamaAudio').textContent = ST.backsound ? ST.backsound.name + ' · ' + ukuranTeks(ST.backsound.size) : 'Belum ada backsound';
    };
    $('stHapusAudio').onclick = () => { ST.backsound = null; $('stAudio').value = ''; $('stNamaAudio').textContent = 'Belum ada backsound'; };
    ['stAwal', 'stAkhir', 'stTeksKlip', 'stPosisiTeks', 'stWarnaTeks'].forEach(id => {
      const el = $(id); if (!el) return;
      el.oninput = bacaForm;
      el.onchange = bacaForm;
    });
    $('stTandaiAwal').onclick = () => {
      if (!ST.terpilih) return;
      $('stAwal').value = angka(Math.min($('stVideo').currentTime || 0, (ST.terpilih.durasi || 0) - 0.3));
      bacaForm();
    };
    $('stTandaiAkhir').onclick = () => {
      if (!ST.terpilih) return;
      $('stAkhir').value = angka(Math.max(Number($('stAwal').value) + 0.3, $('stVideo').currentTime || 0));
      bacaForm();
    };
    $('stPutar').onclick = putarJeda;
    $('stSeqRange').oninput = () => {
      jedaSequence();
      ST.pos = Number($('stSeqRange').value) || 0;
      perbaruiWaktu();
      const p = klipPada(ST.pos); if (p) tampilkanKlip(p, false);
    };
    $('stPecah').onclick = pecahDiPosisi;
    $('stRasio').onchange = () => {
      const { W, H } = ukuranRasio();
      $('stPratinjau').style.aspectRatio = W + ' / ' + H;
    };
    $('stVideo').ontimeupdate = () => {
      const v = $('stVideo');
      if (ST.putar) {
        const p = klipPada(ST.pos);
        if (!p) return;
        if (v.currentTime >= (Number(p.k.trimAkhir) || 0) - 0.06) {
          const total = totalDurasi();
          const next = p.mulai + p.dur + 0.001;
          v.pause();
          if (next >= total - 0.05) {
            ST.putar = false; $('stPutar').textContent = '▶';
            ST.pos = total; perbaruiWaktu(); renderPlaylist();
          } else {
            mainkanDari(next);
          }
          return;
        }
        ST.pos = p.mulai + Math.max(0, v.currentTime - (Number(p.k.trimAwal) || 0));
        perbaruiWaktu();
      } else if (ST.terpilih) {
        const k = ST.terpilih;
        if (k.trimAkhir && v.currentTime >= k.trimAkhir) { v.pause(); v.currentTime = k.trimAwal || 0; }
      }
    };
    $('stVideo').onended = () => {
      if (!ST.putar) return;
      const p = klipPada(ST.pos); if (!p) return;
      const next = p.mulai + p.dur + 0.001;
      if (next >= totalDurasi() - 0.05) { ST.putar = false; $('stPutar').textContent = '▶'; perbaruiWaktu(); renderPlaylist(); }
      else mainkanDari(next);
    };
    $('stRender').onclick = render;
    $('stVol').oninput = () => { $('stVolNilai').textContent = $('stVol').value + '%'; };
    $('stVolKlip').oninput = () => { $('stVolKlipNilai').textContent = $('stVolKlip').value + '%'; };
    $('stVolNilai').textContent = $('stVol').value + '%';
    $('stVolKlipNilai').textContent = $('stVolKlip').value + '%';
    pasangTimeline();
    pasangShortcut();
  }

  /* ---------------- API untuk app.js ---------------- */
  window.StudioVideo = {
    async tampilkan() {
      if (!ST.muat) await muatDaftar();
      renderDaftar(); renderPlaylist(); sinkronForm();
      const { W, H } = ukuranRasio();
      $('stPratinjau').style.aspectRatio = W + ' / ' + H;
      perbaruiWaktu();
    },
    muatUlang: async () => { ST.muat = false; await muatDaftar(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pasang);
  else pasang();
})();
