/* jshint esversion: 11 */
/* global SpaceCtx, MEGA, megajs, exifGps */
(function () {
  'use strict';

  // ---------- util ----------
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmt = n => {
    n = Number(n) || 0;
    const m = Math.floor(n / 60), s = (n % 60).toFixed(2);
    return String(m).padStart(2, '0') + ':' + s.padStart(5, '0');
  };
  const bulat = n => Math.round((Number(n) || 0) * 1000) / 1000;
  const tampil = n => (Math.round((Number(n) || 0) * 10) / 10).toFixed(1).replace('.', ',');

  // ---------- state ----------
  const ST = {
    media: [],           // daftar klip media (dari room atau impor lokal)
    katalog: [],         // { id, nama, room, petugas, durasi, ts }
    timeline: [],        // urutan klip (potongan) yang aktif
    pilihan: null,       // id klip timeline yang dipilih
    audio: null,         // backsound File
    voiceover: null,     // voiceover File
    volAudio: 0.35,
    volKlip: 1,
    volVoiceover: 1,
    rasio: '16:9',
    // pemutar urutan
    seq: { putar: false, raf: 0, mulai: 0, offset: 0, indeks: 0, durasi: 0 },
    // drag timeline
    drag: null
  };

  // ---------- EDL ----------
  const EDL = {
    versi: 'dkpoint-edl/1',
    VERSI: 'dkpoint-edl/1',

    // katalog klip dari StudioVideo.edl.katalog()
    async katalog() {
      const room = (typeof SpaceCtx !== 'undefined' && SpaceCtx.room) ? SpaceCtx.room : '';
      const daftar = await ambilMediaRoom(room);
      ST.media = daftar;
      ST.katalog = daftar.map(m => ({
        id: m.id,
        nama: m.nama,
        room: m.room || room || 'LOKAL',
        petugas: m.petugas || '',
        durasi: m.durasi || 0,
        ts: m.ts || null
      }));
      return { room: room || 'LOKAL', klip: ST.katalog };
    },

    validasi(edl) {
      if (window.EDL && typeof window.EDL.validasi === 'function') return window.EDL.validasi(edl);
      // fallback minimal
      if (!edl || edl.versi !== 'dkpoint-edl/1') return { ok: false, galat: [{ pesan: 'versi tidak valid' }], edl: null };
      if (!Array.isArray(edl.urutan) || !edl.urutan.length) return { ok: false, galat: [{ pesan: 'urutan kosong' }], edl: null };
      return { ok: true, galat: [], edl };
    },

    // EDL sekarang (dari timeline)
    ambil() {
      if (!ST.timeline.length) return null;
      const urutan = ST.timeline.map((klip, i) => ({
        id: klip.id || ('sc-' + (i + 1)),
        klip: { id: klip.mediaId, nama: klip.nama, room: klip.room, durasi: klip.durasiAsli },
        masuk: klip.masuk,
        keluar: klip.keluar,
        teks: klip.teks || '',
        posisiTeks: klip.posisiTeks || 'bawah',
        warnaTeks: klip.warnaTeks || '#ffffff',
        ...(klip.narasi ? { narasi: klip.narasi } : {})
      }));
      return {
        versi: 'dkpoint-edl/1',
        dibuat: new Date().toISOString(),
        sumber: 'studio-video',
        keluaran: { rasio: ST.rasio, judul: ($('stJudul') && $('stJudul').value.trim()) || '', penutup: ($('stPenutup') && $('stPenutup').value.trim()) || '' },
        urutan,
        catatan: ''
      };
    },

    // Terapkan EDL: potong timeline
    async terapkan(edl) {
      const cek = this.validasi(edl);
      if (!cek.ok) return { ok: false, galat: cek.galat };
      const e = cek.edl;
      const mediaDaftar = await ambilMediaRoom(typeof SpaceCtx !== 'undefined' && SpaceCtx.room ? SpaceCtx.room : '');
      const peta = new Map();
      mediaDaftar.forEach(m => peta.set(m.id, m));

      const baru = [];
      const galat = [];
      for (const a of e.urutan) {
        const ref = a.klip.id;
        let media = peta.get(ref);
        if (!media) {
          // cari berdasarkan nama
          media = mediaDaftar.find(m => m.nama && m.nama === a.klip.nama);
        }
        if (!media) {
          // cari di ST.media / katalog
          media = ST.media.find(m => m.id === ref) || ST.media.find(m => m.nama && m.nama === a.klip.nama);
        }
        if (!media) { galat.push({ path: a.id, pesan: 'klip tidak ditemukan: ' + ref }); continue; }
        const dur = media.durasi || a.klip.durasi || 0;
        const masuk = Math.max(0, Number(a.masuk) || 0);
        const keluar = Math.min(dur || Infinity, Number(a.keluar) || dur);
        if (!(keluar - masuk >= 0.3)) { galat.push({ path: a.id, pesan: 'durasi adegan < 0.3s' }); continue; }
        baru.push({
          id: a.id || ('sc-' + (baru.length + 1)),
          mediaId: media.id,
          nama: media.nama,
          room: media.room || (typeof SpaceCtx !== 'undefined' && SpaceCtx.room) || 'LOKAL',
          durasiAsli: dur,
          masuk, keluar,
          teks: a.teks || '',
          posisiTeks: a.posisiTeks || 'bawah',
          warnaTeks: a.warnaTeks || '#ffffff',
          narasi: a.narasi || ''
        });
      }
      ST.timeline = baru;
      ST.pilihan = baru.length ? baru[0].id : null;
      if (edl.keluaran) {
        ST.rasio = edl.keluaran.rasio || ST.rasio;
        const r = $('stRasio'); if (r && edl.keluaran.rasio) r.value = edl.keluaran.rasio;
        const j = $('stJudul'); if (j && edl.keluaran.judul) j.value = edl.keluaran.judul;
        const p = $('stPenutup'); if (p && edl.keluaran.penutup) p.value = edl.keluaran.penutup;
      }
      renderTimeline();
      renderMedia();
      if (ST.pilihan) sinkronForm();
      const total = ST.timeline.reduce((n, k) => n + (k.keluar - k.masuk), 0);
      return { ok: true, jumlah: ST.timeline.length, totalDetik: total, galat };
    }
  };

  // ---------- media room ----------
  async function ambilMediaRoom(room) {
    // gabungkan klip dari Galeri Video (MEGA) + impor lokal (ST.mediaLokal)
    const hasil = [];
    // 1) klip dari room MEGA: coba pakai SpaceCtx.katalogVideo jika ada
    try {
      if (typeof SpaceCtx !== 'undefined' && typeof SpaceCtx.ambilVideoRoom === 'function') {
        const list = await SpaceCtx.ambilVideoRoom(room);
        if (Array.isArray(list)) list.forEach(v => hasil.push(normalisasiMedia(v, room)));
      }
    } catch (e) { /* ignore */ }
    // 2) fallback: baca dari ST.mediaLokal
    if (!hasil.length && Array.isArray(ST.mediaLokal)) {
      ST.mediaLokal.forEach(v => hasil.push(normalisasiMedia(v, room)));
    }
    // 3) impor lokal yang belum terdaftar
    if (Array.isArray(ST.imporLokal)) {
      ST.imporLokal.forEach(v => {
        if (!hasil.find(h => h.id === v.id)) hasil.push(normalisasiMedia(v, room));
      });
    }
    return hasil;
  }

  function normalisasiMedia(v, room) {
    const id = v.id || v.path || v.key || ('l:' + (v.nama || v.name) + ':' + (v.ukuran || v.size || 0) + ':' + (v.ts || Date.now()));
    return {
      id: String(id),
      nama: v.nama || v.name || v.berkas || 'klip',
      room: v.room || room || 'LOKAL',
      petugas: v.petugas || v.petugasNama || '',
      durasi: Number(v.durasi || v.duration || 0) || 0,
      ts: v.ts || v.waktu || null,
      url: v.url || v.src || null,
      _raw: v
    };
  }

  ST.mediaLokal = [];
  ST.imporLokal = [];

  // ---------- import lokal ----------
  function tambahLokal(file) {
    const url = URL.createObjectURL(file);
    const id = 'l:' + file.name + ':' + file.size + ':' + Date.now();
    const item = { id, nama: file.name, room: 'LOKAL', petugas: '', durasi: 0, ts: Date.now(), url, file, _raw: file };
    // baca durasi
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.src = url;
    vid.addEventListener('loadedmetadata', () => {
      item.durasi = vid.duration || 0;
      renderMedia();
    });
    // foto: durasi 0 (belum jadi klip video)
    if (file.type && file.type.startsWith('image/')) {
      item._foto = true;
      item.durasi = 0;
    }
    ST.imporLokal.push(item);
    renderMedia();
    return item;
  }

  // ---------- render media ----------
  function renderMedia() {
    const daftar = $('stDaftarKlip');
    if (!daftar) return;
    // kelompokkan berdasarkan room/petugas
    const grup = {};
    ST.media.forEach(m => {
      const k = (m.room || 'LOKAL') + (m.petugas ? ' · ' + m.petugas : '');
      (grup[k] = grup[k] || []).push(m);
    });
    // tambahkan impor lokal
    if (ST.imporLokal.length) {
      const k = 'Impor lokal';
      grup[k] = (grup[k] || []).concat(ST.imporLokal.filter(x => !Object.values(grup).flat().find(y => y.id === x.id)));
    }
    daftar.innerHTML = Object.keys(grup).map(k => {
      const items = grup[k].map(m => {
        const dipakai = ST.timeline.some(t => t.mediaId === m.id);
        return '<button class="stKlip' + (dipakai ? ' dipakai' : '') + '" data-media="' + esc(m.id) + '">' +
          '<span class="stNama">' + esc(m.nama) + '</span>' +
          '<span class="kecil">' + (m.durasi ? tampil(m.durasi) + ' dtk' : (m._foto ? 'foto' : 'memuat…')) + '</span>' +
          (dipakai ? '<span class="stCek">✓</span>' : '') +
          '</button>';
      }).join('');
      return '<div class="stGrup"><b>' + esc(k) + '</b>' + items + '</div>';
    }).join('') || '<p class="kecil">Belum ada klip.</p>';

    daftar.querySelectorAll('[data-media]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-media');
        const m = [...ST.media, ...ST.imporLokal].find(x => x.id === id);
        if (!m) return;
        if (m._foto) {
          // foto: belum jadi klip video — informasikan
          if (window.SpaceCtx && typeof window.SpaceCtx.status === 'function') window.SpaceCtx.status('Foto diimpor. Konversi foto→klip video belum tersedia; gunakan video.');
          return;
        }
        // tambahkan ke timeline sebagai klip penuh
        ST.timeline.push({
          id: 'tl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          mediaId: m.id,
          nama: m.nama,
          room: m.room,
          durasiAsli: m.durasi || 0,
          masuk: 0,
          keluar: m.durasi || 0,
          teks: '',
          posisiTeks: 'bawah',
          warnaTeks: '#ffffff',
          narasi: ''
        });
        renderTimeline();
        renderMedia();
      });
    });

    const jum = $('stJumlah');
    if (jum) jum.textContent = ST.media.length + ST.imporLokal.length + ' media';
  }

  // ---------- timeline render ----------
  function renderTimeline() {
    const el = $('stTimeline');
    if (!el) return;
    if (!ST.timeline.length) {
      el.innerHTML = '<p class="kecil" style="align-self:center;margin:auto">Tarik klip dari media ke sini, atau gunakan Agen AI.</p>';
      const tot = $('stTotal'); if (tot) tot.textContent = '0 klip';
      return;
    }
    el.innerHTML = ST.timeline.map((k, i) => {
      const dur = (k.keluar - k.masuk);
      const thumb = (function () {
        const m = [...ST.media, ...ST.imporLokal].find(x => x.id === k.mediaId);
        if (m && m.url) return '<img src="' + esc(m.url) + '" alt="">';
        return '<div class="stTanpaThumb">🎬</div>';
      })();
      const narasiRingkas = k.narasi ? ' · ' + esc(k.narasi.slice(0, 40)) : '';
      return '<div class="stKlipTL' + (ST.pilihan === k.id ? ' pilih' : '') + '" data-tl="' + esc(k.id) + '" draggable="true">' +
        thumb +
        '<span class="stDur">' + tampil(dur) + '</span>' +
        '<div class="stInfoTL"><b>' + esc(k.nama) + '</b><span>' + esc(k.teks || '—') + narasiRingkas + '</span></div>' +
        '<div class="stHandle kiri" data-handle="kiri"></div>' +
        '<div class="stHandle kanan" data-handle="kanan"></div>' +
        '<div class="stAksiTL"><button data-aksi="hapus" title="Hapus">✕</button></div>' +
        '</div>';
    }).join('');

    const tot = $('stTotal'); if (tot) tot.textContent = ST.timeline.length + ' klip';

    el.querySelectorAll('[data-tl]').forEach(node => {
      const id = node.getAttribute('data-tl');
      node.addEventListener('click', e => {
        if (e.target && e.target.closest('[data-handle]')) return;
        if (e.target && e.target.closest('[data-aksi]')) return;
        ST.pilihan = id;
        renderTimeline();
        sinkronForm();
      });
      node.addEventListener('dragstart', e => {
        ST.drag = { id, dari: ST.timeline.findIndex(k => k.id === id) };
        node.classList.add('geser');
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      node.addEventListener('dragend', () => { node.classList.remove('geser'); ST.drag = null; });
      node.addEventListener('dragover', e => { e.preventDefault(); node.classList.add('masuk'); });
      node.addEventListener('dragleave', () => node.classList.remove('masuk'));
      node.addEventListener('drop', e => {
        e.preventDefault();
        node.classList.remove('masuk');
        if (!ST.drag) return;
        const dari = ST.drag.dari;
        const ke = ST.timeline.findIndex(k => k.id === id);
        if (dari < 0 || ke < 0 || dari === ke) return;
        const item = ST.timeline.splice(dari, 1)[0];
        ST.timeline.splice(ke, 0, item);
        renderTimeline();
        renderMedia();
      });
      // handle trim
      node.querySelectorAll('[data-handle]').forEach(h => {
        h.addEventListener('pointerdown', ev => mulaiTrim(ev, id, h.getAttribute('data-handle')));
      });
      // hapus
      node.querySelectorAll('[data-aksi="hapus"]').forEach(b => {
        b.addEventListener('click', e => {
          e.stopPropagation();
          ST.timeline = ST.timeline.filter(k => k.id !== id);
          if (ST.pilihan === id) ST.pilihan = ST.timeline.length ? ST.timeline[0].id : null;
          renderTimeline();
          renderMedia();
          if (ST.pilihan) sinkronForm();
        });
      });
    });
  }

  // ---------- trim handle ----------
  let trimState = null;
  function mulaiTrim(ev, id, sisi) {
    ev.stopPropagation();
    ev.preventDefault();
    const klip = ST.timeline.find(k => k.id === id);
    if (!klip) return;
    trimState = { id, sisi, startX: ev.clientX, masuk0: klip.masuk, keluar0: klip.keluar, dur: klip.durasiAsli };
    const onMove = e => {
      if (!trimState) return;
      const dx = e.clientX - trimState.startX;
      const skala = 8; // px per detik (kasar)
      const delta = dx / skala;
      const k = ST.timeline.find(x => x.id === trimState.id);
      if (!k) return;
      if (trimState.sisi === 'kiri') {
        let m = trimState.masuk0 + delta;
        m = Math.max(0, Math.min(m, k.keluar - 0.3));
        k.masuk = bulat(m);
      } else {
        let kl = trimState.keluar0 + delta;
        kl = Math.max(k.masuk + 0.3, Math.min(kl, k.durasiAsli || kl));
        k.keluar = bulat(kl);
      }
      renderTimeline();
    };
    const onUp = () => {
      trimState = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      sinkronForm();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // ---------- form sinkron ----------
  function sinkronForm() {
    const k = ST.timeline.find(x => x.id === ST.pilihan);
    if (!k) return;
    const set = (id, v) => { const e = $(id); if (e) e.value = v; };
    set('stAwal', k.masuk);
    set('stAkhir', k.keluar);
    set('stTeksKlip', k.teks || '');
    set('stNarasiKlip', k.narasi || '');
    set('stPosisiTeks', k.posisiTeks || 'bawah');
    set('stWarnaTeks', k.warnaTeks || '#ffffff');
    const nk = $('stNamaKlip'); if (nk) nk.textContent = k.nama || 'Klip';
    // pratinjau teks
    const tp = $('stTeksPratinjau');
    if (tp) {
      tp.textContent = k.teks || '';
      tp.className = 'stTeksPratinjau ' + (k.posisiTeks || 'bawah');
      tp.style.color = k.warnaTeks || '#ffffff';
      tp.style.display = k.teks ? 'block' : 'none';
    }
  }

  function bacaForm() {
    const k = ST.timeline.find(x => x.id === ST.pilihan);
    if (!k) return;
    const g = id => { const e = $(id); return e ? e.value : ''; };
    k.masuk = Math.max(0, Number(g('stAwal')) || 0);
    k.keluar = Math.max(k.masuk + 0.3, Number(g('stAkhir')) || k.keluar);
    k.teks = String(g('stTeksKlip')).trim();
    k.narasi = String(g('stNarasiKlip')).trim().slice(0, 500);
    k.posisiTeks = g('stPosisiTeks') || 'bawah';
    k.warnaTeks = g('stWarnaTeks') || '#ffffff';
    renderTimeline();
  }

  // ---------- bacakan / salin ----------
  function bacakan() {
    const el = $('stNarasi');
    const teks = el ? el.value.trim() : '';
    if (!teks) return;
    if (!('speechSynthesis' in window)) { alert('Pratinjau suara tidak didukung di browser ini.'); return; }
    try { window.speechSynthesis.cancel(); } catch (_) {}
    const u = new SpeechSynthesisUtterance(teks);
    u.lang = 'id-ID';
    u.rate = 1;
    window.speechSynthesis.speak(u);
  }
  function salinNarasi() {
    const el = $('stNarasi');
    const teks = el ? el.value.trim() : '';
    if (!teks) return;
    if (navigator.clipboard) navigator.clipboard.writeText(teks).catch(() => {});
  }

  // ---------- widget capture ----------
  function pasangWidgetCapture() {
    const wVideo = $('wCaptureVideo');
    const wFoto = $('wCaptureFoto');
    const wShortcut = $('wFotoUntukVideo');
    const wFileVideo = $('wFileVideo');
    const wFileFoto = $('wFileFoto');
    if (wVideo && wFileVideo) wVideo.addEventListener('click', () => wFileVideo.click());
    if (wFoto && wFileFoto) wFoto.addEventListener('click', () => wFileFoto.click());
    if (wShortcut && wFileFoto) wShortcut.addEventListener('click', () => wFileFoto.click());
    if (wFileVideo) wFileVideo.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) tambahLokal(f);
      e.target.value = '';
    });
    if (wFileFoto) wFileFoto.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) tambahLokal(f);
      e.target.value = '';
    });
  }

  // ---------- audio ----------
  function pasangAudio() {
    const a = $('stAudio');
    if (a) a.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) { ST.audio = f; const n = $('stNamaAudio'); if (n) n.textContent = f.name; }
    });
    const h = $('stHapusAudio');
    if (h) h.addEventListener('click', () => { ST.audio = null; const n = $('stNamaAudio'); if (n) n.textContent = 'Belum ada backsound'; const i = $('stAudio'); if (i) i.value = ''; });
    const v = $('stVol');
    if (v) v.addEventListener('input', () => { ST.volAudio = (Number(v.value) || 0) / 100; const n = $('stVolNilai'); if (n) n.textContent = v.value + '%'; });

    const vo = $('stVoiceover');
    if (vo) vo.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) { ST.voiceover = f; const n = $('stNamaVoiceover'); if (n) n.textContent = f.name; }
    });
    const hv = $('stHapusVoiceover');
    if (hv) hv.addEventListener('click', () => { ST.voiceover = null; const n = $('stNamaVoiceover'); if (n) n.textContent = 'Belum ada voiceover'; const i = $('stVoiceover'); if (i) i.value = ''; });
    const vv = $('stVolVoiceover');
    if (vv) vv.addEventListener('input', () => { ST.volVoiceover = (Number(vv.value) || 0) / 100; const n = $('stVolVoiceoverNilai'); if (n) n.textContent = vv.value + '%'; });

    const vk = $('stVolKlip');
    if (vk) vk.addEventListener('input', () => { ST.volKlip = (Number(vk.value) || 0) / 100; const n = $('stVolKlipNilai'); if (n) n.textContent = vk.value + '%'; });
  }

  // ---------- render (ffmpeg) ----------
  async function renderVideo() {
    const btn = $('stRender');
    const prog = $('stProgres');
    if (btn) btn.disabled = true;
    if (prog) { prog.textContent = 'Menyiapkan ffmpeg…'; prog.className = 'stProgres'; }
    try {
      // placeholder: implementasi render ffmpeg.wasm di sini
      if (prog) prog.textContent = 'Render belum diimplementasikan di versi ini.';
    } catch (e) {
      if (prog) { prog.textContent = 'Gagal: ' + (e && e.message || e); prog.className = 'stProgres galat'; }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ---------- impor video ----------
  function pasangImpor() {
    const f = $('stFile');
    if (!f) return;
    f.addEventListener('change', e => {
      const files = e.target.files;
      if (!files) return;
      for (const file of files) tambahLokal(file);
      e.target.value = '';
    });
    const mu = $('stMuatUlang');
    if (mu) mu.addEventListener('click', async () => {
      try { await EDL.katalog(); renderMedia(); } catch (_) {}
    });
  }

  // ---------- tabs ----------
  function pasangTabs() {
    document.querySelectorAll('[data-cctab]').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('[data-cctab]').forEach(x => x.classList.remove('pilih'));
        b.classList.add('pilih');
        const nama = b.getAttribute('data-cctab');
        document.querySelectorAll('[data-ccpanel]').forEach(p => {
          p.hidden = p.getAttribute('data-ccpanel') !== nama;
        });
      });
    });
  }

  // ---------- form events ----------
  function pasangForm() {
    ['stAwal', 'stAkhir', 'stTeksKlip', 'stNarasiKlip', 'stPosisiTeks', 'stWarnaTeks'].forEach(id => {
      const e = $(id);
      if (e) e.addEventListener('change', bacaForm);
      if (e) e.addEventListener('input', () => { if (id === 'stNarasiKlip') { const k = ST.timeline.find(x => x.id === ST.pilihan); if (k) k.narasi = String(e.value).trim().slice(0, 500); } });
    });
    const b = $('stBacakan'); if (b) b.addEventListener('click', bacakan);
    const s = $('stSalinNarasi'); if (s) s.addEventListener('click', salinNarasi);
    const r = $('stRender'); if (r) r.addEventListener('click', renderVideo);
  }

  // ---------- init ----------
  function init() {
    pasangTabs();
    pasangAudio();
    pasangImpor();
    pasangForm();
    pasangWidgetCapture();
    try { EDL.katalog().then(() => renderMedia()).catch(() => {}); } catch (_) {}
    // expose
    window.StudioVideo = { ST, EDL, renderMedia, renderTimeline, sinkronForm, tambahLokal };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
