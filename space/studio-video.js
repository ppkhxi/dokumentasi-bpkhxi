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
    ff: null, memuatFF: null, log: [], renderJalan: false
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
    Array.from(files || []).forEach(f => {
      const k = {
        id: 'l:' + f.name + ':' + f.size + ':' + (f.lastModified || 0),
        room: 'LOKAL', petugas: 'Lokal', nama: f.name, file: f, sumber: 'lokal',
        ukuran: f.size, durasi: 0, ts: f.lastModified || Date.now()
      };
      Object.assign(k, BARU);
      ST.pilih.push(k);
      ST.terpilih = k;
    });
    renderPlaylist(); renderDaftar();
    if (ST.terpilih) bukaKlip(ST.terpilih);
  }

  /* ---------------- urutan & pratinjau ---------------- */
  function renderPlaylist() {
    const box = $('stTimeline'); if (!box) return;
    if (!ST.pilih.length) {
      box.innerHTML = '<p class="kecil" style="margin:0">Urutan masih kosong. Pilih klip di kiri; urutan di sini menentukan hasil video.</p>';
      $('stTotal').textContent = '0 klip';
      return;
    }
    box.innerHTML = ST.pilih.map((k, i) =>
      '<div class="stItem' + (ST.terpilih === k ? ' pilih' : '') + '" data-i="' + i + '">' +
        '<span class="stNo">' + (i + 1) + '</span>' +
        '<span class="stKet"><b>' + esc(k.nama) + '</b>' +
        '<span class="kecil">' + esc(k.room) + ' · ' + detik((k.trimAkhir || k.durasi) - k.trimAwal) + (k.teks ? ' · "' + esc(k.teks.slice(0, 28)) + '"' : '') + '</span></span>' +
        '<span class="stAksi"><button data-a="naik" title="Naikkan">↑</button><button data-a="turun" title="Turunkan">↓</button>' +
        '<button data-a="buang" title="Keluarkan">✕</button></span></div>').join('');
    const total = ST.pilih.reduce((a, k) => a + Math.max(0, (k.trimAkhir || k.durasi) - k.trimAwal), 0);
    $('stTotal').textContent = ST.pilih.length + ' klip · ' + detik(total) + ' · ' + ukuranTeks(ST.pilih.reduce((a, k) => a + (k.ukuran || 0), 0));
    box.querySelectorAll('.stItem').forEach(el => {
      const i = +el.dataset.i;
      el.onclick = e => {
        const b = e.target.closest('button');
        if (!b) { ST.terpilih = ST.pilih[i]; renderPlaylist(); bukaKlip(ST.terpilih); return; }
        const a = b.dataset.a;
        if (a === 'buang') { const [x] = ST.pilih.splice(i, 1); if (ST.terpilih === x) ST.terpilih = ST.pilih[Math.min(i, ST.pilih.length - 1)] || null; }
        else {
          const j = a === 'naik' ? i - 1 : i + 1;
          if (j < 0 || j >= ST.pilih.length) return;
          const t = ST.pilih[i]; ST.pilih[i] = ST.pilih[j]; ST.pilih[j] = t;
        }
        renderPlaylist(); renderDaftar();
        if (ST.terpilih) sinkronForm();
      };
    });
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
      let url = k.url;
      if (!url) {
        const bytes = await bytesKlip(k);
        url = k.url = URL.createObjectURL(new Blob([bytes], { type: /\.webm$/i.test(k.nama) ? 'video/webm' : 'video/mp4' }));
      }
      v.src = url;
      v.onloadedmetadata = () => {
        if (!isFinite(v.duration)) return;
        if (!k.durasi) { k.durasi = v.duration; renderPlaylist(); renderDaftar(); }
        if (!k.trimAkhir) k.trimAkhir = v.duration;
        sinkronForm();
      };
      v.currentTime = k.trimAwal || 0;
      v.play().catch(() => {});
      tampilTeksPratinjau(k);
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
  async function render() {
    if (ST.renderJalan) return;
    if (!ST.pilih.length) { status('Tambahkan klip dulu sebelum menggabungkan.', true); return; }
    if (ST.pilih.length > 30) { status('Maksimal 30 klip per render. Bagi menjadi beberapa video.', true); return; }
    const c = ctx();
    ST.renderJalan = true;
    $('stRender').disabled = true;
    const { W, H } = ukuranRasio();
    const judul = $('stJudul').value.trim();
    const penutup = $('stPenutup').value.trim();
    const volKlip = (Number($('stVolKlip').value) || 100) / 100;
    const volMusik = (Number($('stVol').value) || 35) / 100;
    let hasilNama = '';
    try {
      const ff = await siapkanFF();
      for (const k of ST.pilih) await pastikanDurasi(k);
      renderPlaylist();
      targetProgres = ST.pilih.reduce((a, k) => a + Math.max(0, (k.trimAkhir || k.durasi) - k.trimAwal), 0);
      capaianProgres = 0;

      // font untuk drawtext
      const font = await fetch('js/Roboto-Regular.ttf');
      if (!font.ok) throw new Error('Font teks tidak ditemukan (js/Roboto-Regular.ttf)');
      await ff.writeFile('font.ttf', new Uint8Array(await font.arrayBuffer()));

      const berkas = [];
      for (let i = 0; i < ST.pilih.length; i++) {
        const k = ST.pilih[i];
        const bytes = await bytesKlip(k);
        const ext = /\.webm$/i.test(k.nama) ? '.webm' : '.mp4';
        const masuk = 'in' + i + ext;
        await ff.writeFile(masuk, bytes);
        const D = Math.max(0.3, (k.trimAkhir || k.durasi) - k.trimAwal);
        let vf = 'scale=' + W + ':' + H + ':force_original_aspect_ratio=increase,crop=' + W + ':' + H + ',setsar=1,fps=30';
        if (k.teks) {
          const namaTeks = 'teks' + i + '.txt';
          await ff.writeFile(namaTeks, new TextEncoder().encode(k.teks));
          vf += ',' + drawtext({ file: namaTeks, fontsize: Math.round(W * 0.038), pos: k.posisi, warna: k.warna, H, dari: 0, sampai: D });
        }
        const adaAudio = await punyaAudio(ff, masuk);
        const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
        let args;
        if (adaAudio) {
          args = ['-ss', String(k.trimAwal || 0), '-t', String(D), '-i', masuk, '-vf', vf,
            '-af', 'volume=' + volKlip.toFixed(2), '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', ...enc, 'p' + i + '.mp4'];
        } else {
          args = ['-ss', String(k.trimAwal || 0), '-t', String(D), '-i', masuk,
            '-f', 'lavfi', '-t', String(D), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
            '-vf', vf, '-map', '0:v:0', '-map', '1:a:0', '-c:a', 'aac', '-b:a', '160k', ...enc, 'p' + i + '.mp4'];
        }
        const kode = await ff.exec(args);
        if (kode !== 0) throw new Error('Klip ' + (i + 1) + ' (' + k.nama + ') gagal diproses. Coba klip lain atau turunkan jumlah klip.');
        berkas.push('p' + i + '.mp4');
        await ff.deleteFile(masuk).catch(() => {});
      }

      await ff.writeFile('list.txt', new TextEncoder().encode(berkas.map(n => "file '" + n + "'").join('\n')));
      progres('Menyambung ' + berkas.length + ' klip…');
      let kode = await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'gabung.mp4']);
      if (kode !== 0) throw new Error('Penyambungan klip gagal.');
      for (const n of berkas) await ff.deleteFile(n).catch(() => {});

      const total = targetProgres;
      const adaJudul = !!judul, adaPenutup = !!penutup;
      let hasil = 'gabung.mp4';
      if (adaJudul || adaPenutup || ST.backsound) {
        progres('Menambahkan ' + [adaJudul ? 'judul' : '', adaPenutup ? 'penutup' : '', ST.backsound ? 'backsound' : ''].filter(Boolean).join(', ') + '…');
        const args = ['-i', 'gabung.mp4'];
        const graf = [];
        const rantaiV = [];
        if (adaJudul || adaPenutup) {
          if (adaJudul) {
            await ff.writeFile('judul.txt', new TextEncoder().encode(judul));
            rantaiV.push('[0:v]' + drawtext({ file: 'judul.txt', fontsize: Math.round(W * 0.05), pos: 'atas', warna: '#ffffff', H, dari: 0, sampai: Math.min(4, Math.max(1.5, total * 0.25)) }) + '[v1]');
          }
          if (adaPenutup) {
            await ff.writeFile('penutup.txt', new TextEncoder().encode(penutup));
            const mulai = Math.max(0, total - Math.min(4.5, Math.max(2, total * 0.25)));
            rantaiV.push('[' + (adaJudul ? 'v1' : '0:v') + ']' + drawtext({ file: 'penutup.txt', fontsize: Math.round(W * 0.042), pos: 'bawah', warna: '#ffffff', H, dari: mulai, sampai: total }) + '[vout]');
          } else {
            rantaiV.push('[v1]null[vout]');
          }
        }
        if (ST.backsound) {
          const ekst = (/\.(\w+)$/.exec(ST.backsound.name) || [, 'mp3'])[1].toLowerCase();
          await ff.writeFile('musik.' + ekst, new Uint8Array(await ST.backsound.arrayBuffer()));
          args.push('-stream_loop', '-1', '-i', 'musik.' + ekst);
          graf.push('[1:a]volume=' + volMusik.toFixed(2) + ',afade=t=in:st=0:d=1.2,afade=t=out:st=' + Math.max(0, total - 2).toFixed(2) + ':d=2[a1]');
          graf.push('[0:a][a1]amix=inputs=2:duration=first:dropout_transition=3[aout]');
        }
        if (rantaiV.length) graf.push(...rantaiV);
        const adaV = rantaiV.length > 0;
        if (adaV) args.push('-filter_complex', graf.join(';'), '-map', '[vout]');
        else args.push('-filter_complex', graf.join(';'));
        if (ST.backsound) args.push('-map', '[aout]');
        else if (!adaV) args.push('-map', '0:v:0', '-map', '0:a?');
        if (adaV) args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p');
        else args.push('-c:v', 'copy');
        args.push('-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', 'akhir.mp4');
        kode = await ff.exec(args);
        if (kode !== 0) {
          // backsound bermasalah atau klip tanpa audio: ulangi tanpa backsound
          if (ST.backsound) {
            progres('Backsound gagal diproses — merender tanpa backsound…');
            ST.backsound = null;
            await ff.deleteFile('gabung.mp4').catch(() => {});
            ST.renderJalan = false; $('stRender').disabled = false;
            return render();
          }
          throw new Error('Penambahan judul/backsound gagal (kode ' + kode + ').');
        }
        hasil = 'akhir.mp4';
      }

      const data = await ff.readFile(hasil);
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
      progres('Selesai: ' + hasilNama + ' (' + ukuranTeks(blob.size) + ')');
      status('Video selesai dibuat: ' + hasilNama);
      for (const n of ['gabung.mp4', 'akhir.mp4', 'list.txt', 'font.ttf', 'judul.txt', 'penutup.txt', 'musik.mp3']) await ff.deleteFile(n).catch(() => {});
    } catch (e) {
      console.error('Render video gagal:', e);
      progres('Gagal: ' + (e.message || e), true);
      status('Render video gagal: ' + (e.message || e), true);
    } finally {
      ST.renderJalan = false;
      $('stRender').disabled = false;
    }
  }

  /* ---------------- pemasangan kendali ---------------- */
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
    $('stVideo').ontimeupdate = () => {
      const k = ST.terpilih; if (!k) return;
      const v = $('stVideo');
      if (k.trimAkhir && v.currentTime >= k.trimAkhir) { v.pause(); v.currentTime = k.trimAwal || 0; }
    };
    $('stRender').onclick = render;
    $('stVol').oninput = () => { $('stVolNilai').textContent = $('stVol').value + '%'; };
    $('stVolKlip').oninput = () => { $('stVolKlipNilai').textContent = $('stVolKlip').value + '%'; };
    $('stVolNilai').textContent = $('stVol').value + '%';
    $('stVolKlipNilai').textContent = $('stVolKlip').value + '%';
  }

  /* ---------------- API untuk app.js ---------------- */
  window.StudioVideo = {
    async tampilkan() {
      if (!ST.muat) await muatDaftar();
      renderDaftar(); renderPlaylist(); sinkronForm();
    },
    muatUlang: async () => { ST.muat = false; await muatDaftar(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pasang);
  else pasang();
})();
