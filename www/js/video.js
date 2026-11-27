/* ===========================================================================
   DKPOINT — MODUL VIDEO KEGIATAN
   Rekaman kamera web & kamera HP, penyimpanan klip, galeri, pemutar, dan
   pengiriman ke cloud. Dimuat lebih awal, tetapi pengikat tombol dipasang
   lewat mulaiVideoUI() setelah state S dan DOM siap.
   ========================================================================== */

/* ---------- Penyimpanan klip video (IndexedDB, disimpan sebagai Blob) ---------- */
async function simpanVideo(rec){
  const d=await buka();
  return new Promise((res,rej)=>{const t=d.transaction('video','readwrite');t.objectStore('video').put(rec);t.oncomplete=res;t.onerror=()=>rej(t.error);});
}
async function ambilSemuaVideo(){
  const d=await buka();
  return new Promise((res,rej)=>{const r=d.transaction('video','readonly').objectStore('video').getAll();
    r.onsuccess=()=>res((r.result||[]).sort((a,b)=>b.ts-a.ts)); r.onerror=()=>rej(r.error);});
}
async function hapusVideo(id){
  const d=await buka();
  return new Promise((res,rej)=>{const t=d.transaction('video','readwrite');t.objectStore('video').delete(id);t.oncomplete=res;t.onerror=()=>rej(t.error);});
}


/* =====================================================================
   VIDEO KEGIATAN — rekam klip pendek (default 4 detik, bisa diubah di Setelan),
   simpan ke Galeri → Video. Di APK memakai aplikasi kamera bawaan HP
   (sensor & stabilizer asli); di browser/PWA memakai kamera web bitrate tinggi.
   ===================================================================== */
const VID_MAKS_DEFAULT = 4;
function vidMaksDetik(){
  const n = parseInt(localStorage.getItem('dkpoint_video_detik') || '', 10);
  return Number.isFinite(n) ? Math.min(15, Math.max(2, n)) : VID_MAKS_DEFAULT;
}
function vidMaksMs(){ return vidMaksDetik() * 1000; }
const V = {stream:null, rec:null, chunks:[], mulai:0, timer:null, mime:''};
function perbaruiInfoDurasiVideo(){
  const detik = vidMaksDetik();
  const native = !!(window.DokumentasiNative && window.DokumentasiNative.rekamVideo);
  if($('vidChip')) $('vidChip').textContent = (native ? 'Kamera HP' : '1080p') + ' · maks ' + detik + ' detik';
  if($('vidNota')) $('vidNota').textContent = 'Klip maksimal ' + detik + ' detik (bisa diubah di Setelan). Tersimpan di Galeri → Video dan terkirim otomatis ke cloud room mulai pukul 16.00 WIB, sama seperti foto.';
  if($('vidTimer') && !(V.rec && V.rec.state === 'recording')) $('vidTimer').textContent = '00:00 / ' + durasiTeks(detik);
}

function tampilPesanVideo(teks){
  const p = $('vidPesan'); if(!p) return;
  p.textContent = teks;
  p.classList.add('tampil');
}
function sembunyikanPesanVideo(){ const p=$('vidPesan'); if(p) p.classList.remove('tampil'); }

/* Poster + durasi diambil dari klip itu sendiri. */
async function buatPosterVideo(blob){
  return new Promise(resolve=>{
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.playsInline = true;
    const url = URL.createObjectURL(blob);
    let beres = false;
    const tutup = hasil=>{ if(beres) return; beres = true; URL.revokeObjectURL(url); resolve(hasil); };
    v.onloadedmetadata = ()=>{ try{ v.currentTime = Math.min(0.15, Math.max(0.05,(v.duration||1)/4)); }catch(_){ tutup({poster:'', durasi:v.duration||0}); } };
    v.onseeked = ()=>{
      try{
        const w = 480;
        const h = Math.round(w * (v.videoHeight || 270) / (v.videoWidth || 480)) || 270;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(v, 0, 0, w, h);
        tutup({poster: c.toDataURL('image/jpeg', 0.72), durasi: v.duration||0});
      }catch(_){ tutup({poster:'', durasi: v.duration||0}); }
    };
    v.onerror = ()=>tutup({poster:'', durasi:0});
    setTimeout(()=>tutup({poster:'', durasi: v.duration||0}), 4000);
    v.src = url;
  });
}

async function simpanKlipVideo(blob, sumber, namaBerkas){
  const info = await buatPosterVideo(blob);
  const ts = Date.now();
  const stempel = new Date(ts).toISOString().slice(0,19).replace(/[:T-]/g,'');
  const rec = {
    id: 'vid_' + ts,
    ts,
    nama: 'VIDEO_'+stempel+'.mp4',
    ukuran: blob.size,
    durasi: info.durasi || 0,
    mime: blob.type || 'video/mp4',
    blob,
    poster: info.poster || '',
    lat: (S.posisi && S.posisi.lat != null) ? S.posisi.lat : null,
    lon: (S.posisi && S.posisi.lon != null) ? S.posisi.lon : null,
    namaPetugas: S.nama || '',
    room: S.room || 'LOKAL',
    status: 'lokal',
    sumber: sumber || 'web'
  };
  if(namaBerkas) rec.berkasRekam = namaBerkas;
  await simpanVideo(rec);
  perbaruiJumlahVideo();
  muatKlipTerbaru();
  pesan('Klip video tersimpan di Galeri → Video');
  return rec;
}

async function perbaruiJumlahVideo(){
  try{
    const n = (await ambilSemuaVideo()).length;
    const el = $('jmlVideoTab'); if(el) el.textContent = n ? '('+n+')' : '';
  }catch(_){}
}

async function muatKlipTerbaru(){
  const box = $('vidTerbaru'); if(!box) return;
  let list = [];
  try{ list = (await ambilSemuaVideo()).slice(0, 6); }catch(_){}
  if(!list.length){ box.innerHTML = '<p class="vid-nota" style="text-align:left">Belum ada klip. Rekaman pertama Anda akan muncul di sini.</p>'; return; }
  box.innerHTML = list.map(v=>
    '<button class="klip" data-id="'+v.id+'">'+
      (v.poster ? '<img src="'+v.poster+'" alt="">' : '<div style="height:62px;background:#111"></div>')+
      '<b>'+durasiTeks(v.durasi)+' · '+(v.ukuran/1048576).toFixed(1)+' MB</b>'+
    '</button>').join('');
  box.querySelectorAll('.klip').forEach(b=> b.onclick = ()=>bukaPemutarVideo(b.dataset.id));
}

/* ---------- Nyalakan / matikan layar ---------- */
async function nyalakanVideo(){
  const N = window.DokumentasiNative;
  const native = !!(N && N.rekamVideo);
  perbaruiInfoDurasiVideo();
  $('vidNative').style.display = native ? '' : 'none';
  $('vidRekam').style.display = native ? 'none' : '';
  $('vidBalik').style.display = native ? 'none' : '';
  $('vidPratinjau').style.display = native ? 'none' : '';
  $('vidTimer').textContent = '00:00 / ' + durasiTeks(vidMaksDetik());
  $('vidTimer').classList.remove('rekam');
  $('vidRekam').classList.remove('rekam');
  muatKlipTerbaru();
  perbaruiJumlahVideo();
  if(native){
    tampilPesanVideo('Tekan “Rekam dengan Kamera HP”. Perekaman memakai kamera bawaan HP: stabilizer dan sensor bekerja penuh, tanpa kompresi tambahan dari aplikasi.');
    pulihkanRekamanHp(N);
    return;
  }
  tampilPesanVideo('Menyalakan kamera…');
  try{
    V.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: S.facing || 'environment' }, width: {ideal:1920}, height: {ideal:1080} },
      audio: true
    });
    $('vidKamera').srcObject = V.stream;
    sembunyikanPesanVideo();
  }catch(e){
    tampilPesanVideo('Kamera tidak bisa diakses: '+e.message+'. Di aplikasi Android, pakai tombol “Rekam dengan Kamera HP”.');
  }
}

function matikanVideo(){
  try{ if(V.rec && V.rec.state !== 'inactive') V.rec.stop(); }catch(_){}
  if(V.timer){ clearInterval(V.timer); V.timer = null; }
  if(V.stream){ V.stream.getTracks().forEach(t=>t.stop()); V.stream = null; }
  const v = $('vidKamera'); if(v) v.srcObject = null;
  V.rec = null; V.chunks = [];
  const r = $('vidRekam'); if(r) r.classList.remove('rekam');
  const t = $('vidTimer'); if(t){ t.classList.remove('rekam'); t.textContent = '00:00 / ' + durasiTeks(vidMaksDetik()); }
  tutupPemutarVideo();
}

/* ---------- Rekaman di browser/PWA (kamera web, bitrate tinggi) ---------- */
function mulaiRekamVideo(){
  if(!V.stream){ pesan('Kamera belum siap'); return; }
  if(V.rec && V.rec.state === 'recording') return;
  const kandidat = ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm'];
  const mime = kandidat.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  V.chunks = [];
  try{
    V.rec = new MediaRecorder(V.stream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: 12000000,
      audioBitsPerSecond: 128000
    });
  }catch(e){ pesan('Perangkat ini tidak mendukung perekaman video'); return; }
  V.rec.ondataavailable = e=>{ if(e.data && e.data.size) V.chunks.push(e.data); };
  V.rec.onstop = async ()=>{
    const blob = new Blob(V.chunks, {type: (V.rec && V.rec.mimeType) || 'video/webm'});
    V.chunks = [];
    if(blob.size) await simpanKlipVideo(blob, 'web');
  };
  V.rec.start(250);
  V.mulai = Date.now();
  $('vidRekam').classList.add('rekam');
  $('vidTimer').classList.add('rekam');
  if(V.timer) clearInterval(V.timer);
  V.timer = setInterval(()=>{
    const lewat = Date.now() - V.mulai;
    $('vidTimer').textContent = durasiTeks(Math.min(vidMaksMs(), lewat)/1000)+' / '+durasiTeks(vidMaksDetik());
    if(lewat >= vidMaksMs()) hentikanRekamVideo();
  }, 100);
}

function hentikanRekamVideo(){
  if(V.timer){ clearInterval(V.timer); V.timer = null; }
  $('vidRekam').classList.remove('rekam');
  $('vidTimer').classList.remove('rekam');
  try{ if(V.rec && V.rec.state === 'recording') V.rec.stop(); }catch(_){}
}

/* ---------- Rekaman memakai kamera bawaan HP (APK) ---------- */
let sedangRekamHp = false;
function statusRekamHp(N){
  try{ return JSON.parse(N.statusRekam()); }catch(_){ return null; }
}

/* Salin berkas rekaman dari cache aplikasi Android per potongan 512 KB. */
async function bacaBerkasRekam(N, ukuran, onProgres){
  const bagian = [];
  const potong = 512*1024;
  let off = 0;
  while(off < ukuran){
    const b64 = N.bacaRekam(off, potong);
    if(!b64) break;
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
    bagian.push(arr);
    off += arr.length;
    if(onProgres) onProgres(off / ukuran);
    await new Promise(r=>setTimeout(r, 0));   // biarkan layar tetap responsif
  }
  return new Blob(bagian, {type:'video/mp4'});
}

/* Simpan berkas rekaman yang sudah siap dibaca menjadi klip di Galeri → Video. */
async function pakaiBerkasRekam(N, st){
  tampilPesanVideo('Menyimpan klip… 0%');
  const blob = await bacaBerkasRekam(N, st.ukuran, p=>tampilPesanVideo('Menyimpan klip… '+Math.round(p*100)+'%'));
  if(!blob.size) throw new Error('berkas rekaman kosong');
  await simpanKlipVideo(blob, 'native', st.nama);
  try{ N.hapusRekam(); }catch(_){}
  tampilPesanVideo('Klip tersimpan di Galeri → Video.');
}

/* Klip yang sudah direkam tapi belum tersalin (mis. halaman sempat dimuat ulang). */
async function pulihkanRekamanHp(N){
  if(sedangRekamHp || !N || !N.statusRekam) return;
  const st = statusRekamHp(N);
  if(!st || st.status !== 'siap' || !st.ukuran) return;
  sedangRekamHp = true;
  try{
    if(st.nama){
      const sudahAda = (await ambilSemuaVideo()).some(v=>v.berkasRekam === st.nama);
      if(sudahAda){ try{ N.hapusRekam(); }catch(_){} return; }
    }
    tampilPesanVideo('Menyimpan klip rekaman terakhir…');
    await pakaiBerkasRekam(N, st);
  }catch(e){
    tampilPesanVideo('Gagal menyimpan klip: '+e.message);
  }finally{ sedangRekamHp = false; }
}

async function rekamKameraHp(){
  const N = window.DokumentasiNative;
  if(!N || !N.rekamVideo){ pesan('Fitur ini hanya tersedia di aplikasi Android'); return; }
  if(sedangRekamHp){ pesan('Klip sebelumnya masih disimpan, tunggu sebentar'); return; }
  sedangRekamHp = true;
  const mulai = Date.now();
  /* Pantau status SEBELUM membuka kamera. Hasil rekaman hanya terbaca lewat statusRekam(),
     jadi nilai balik rekamVideo() tidak dipakai untuk memutuskan apa pun. */
  const cek = setInterval(async ()=>{
    const st = statusRekamHp(N);
    if(!st) return;
    if(st.status === 'menunggu'){
      if(Date.now() - mulai > 240000){
        clearInterval(cek); sedangRekamHp = false;
        tampilPesanVideo('Perekaman terlalu lama. Silakan coba lagi.');
      }
      return;
    }
    clearInterval(cek);
    if(st.status === 'batal' || !st.ukuran){
      sedangRekamHp = false;
      tampilPesanVideo('Perekaman dibatalkan.');
      return;
    }
    try{
      await pakaiBerkasRekam(N, st);
    }catch(e){
      tampilPesanVideo('Gagal menyimpan klip: '+e.message);
    }finally{ sedangRekamHp = false; }
  }, 350);
  const batasDetik = vidMaksDetik();
  tampilPesanVideo('Merekam dengan kamera HP… kembali ke aplikasi setelah selesai (maksimal '+batasDetik+' detik).');
  try{
    // APK baru menerima durasi dari halaman; APK lama tetap memakai batas bawaannya.
    if(typeof N.rekamVideoDetik === 'function') N.rekamVideoDetik(batasDetik);
    else N.rekamVideo();
  }catch(_){}
}

/* ---------- Galeri → Video ---------- */
async function muatGaleriVideo(){
  const semua = await ambilSemuaVideo();
  const roomAktif = S.room || 'LOKAL';
  const data = (S.lingkupGaleri === 'semua') ? semua : semua.filter(v => (v.room || 'LOKAL') === roomAktif);
  const box = $('isiGaleri');
  perbaruiJumlahVideo();
  if(!data.length){
    box.innerHTML = '<div class="kosong"><span class="ic">\u{1F3AC}</span><p>Belum ada video'+
      (S.lingkupGaleri==='room'?' di room <b>'+esc(S.room)+'</b>':'')+'.<br>Rekam klip kegiatan dari menu Video Kegiatan.</p></div>';
    $('aksiGaleri').innerHTML = '';
    return;
  }
  const totalMB = (data.reduce((a,v)=>a+(v.ukuran||0),0)/1048576).toFixed(1);
  box.innerHTML = '<p style="font-size:12.5px;color:var(--teks-2);margin:0 0 10px">'+data.length+' klip video · '+totalMB+' MB</p>'+
    '<div class="grid-video">'+
    data.map(v=>'<button class="sel-video" data-id="'+v.id+'">'+
      (v.poster?'<img src="'+v.poster+'" alt="">':'<div style="aspect-ratio:16/9;background:#111"></div>')+
      '<span class="stt '+(v.status||'lokal')+'">'+labelStatusVideo(v.status)+'</span>'+
      '<span class="tombol-putar">▶</span>'+
      '<span class="info"><span>'+durasiTeks(v.durasi)+'</span><span>'+fmtWaktu(v.ts)+'</span></span>'+
      '</button>').join('')+'</div>';
  $('aksiGaleri').innerHTML = '';
  box.querySelectorAll('.sel-video').forEach(b=> b.onclick = ()=>bukaPemutarVideo(b.dataset.id));
}

/* ---------- Pemutar video ---------- */
let pemutarUrl = null, pemutarId = null;
async function bukaPemutarVideo(id){
  const list = await ambilSemuaVideo();
  const v = list.find(x=>x.id===id);
  if(!v) return;
  pemutarId = id;
  if(pemutarUrl) URL.revokeObjectURL(pemutarUrl);
  pemutarUrl = URL.createObjectURL(v.blob);
  $('pemutarLayar').src = pemutarUrl;
  $('pemutarJudul').textContent = v.nama || 'Video Kegiatan';
  $('pemutarInfo').innerHTML = fmtWaktu(v.ts)+' · '+durasiTeks(v.durasi)+' · '+(v.ukuran/1048576).toFixed(1)+' MB · '+esc(v.room||'LOKAL')+
    ' · '+esc(labelStatusVideo(v.status)) +
    (v.namaPetugas?' · '+esc(v.namaPetugas):'')+
    (v.lat!=null?'<br>'+v.lat.toFixed(5)+', '+v.lon.toFixed(5):'');
  $('pemutarVideo').classList.add('tampil');
  try{ await $('pemutarLayar').play(); }catch(_){}
}
function tutupPemutarVideo(){
  const w = $('pemutarVideo'); if(!w) return;
  w.classList.remove('tampil');
  const v = $('pemutarLayar');
  if(v){ try{ v.pause(); }catch(_){ } v.removeAttribute('src'); }
  if(pemutarUrl){ URL.revokeObjectURL(pemutarUrl); pemutarUrl = null; }
  pemutarId = null;
}

/* ---------- Kirim klip ke cloud (MEGA) ---------- */
function labelStatusVideo(st){
  return ({terkirim:'✓ Terkirim', mengunggah:'Mengunggah…', gagal:'Gagal kirim'})[st] || 'Di HP';
}

let sedangKirimVideo = false;
async function kirimKlipVideo(id, diam){
  if(typeof MegaEngine === 'undefined' || !MegaEngine.unggahVideo){ if(!diam) pesan('Mesin cloud belum siap'); return false; }
  const v = (await ambilSemuaVideo()).find(x=>x.id===id);
  if(!v){ if(!diam) pesan('Klip tidak ditemukan'); return false; }
  const room = (v.room && v.room !== 'LOKAL') ? v.room : S.room;
  if(!MegaEngine.bisaUpload(room)){
    if(!diam) dialog('<h3>Belum Terhubung Cloud MEGA</h3><p>Room "<b>'+esc(room||'Lokal')+'</b>" belum punya otorisasi Cloud.</p>'+
      '<p class="catatan-kecil">Hubungkan akun MEGA di <b>Setelan</b>, atau masuk room lewat <b>Link/Toket Undangan</b>.</p>'+
      '<button class="tombol" onclick="tutupDialog(); ke(\'pengaturan\')">Buka Setelan</button>'+
      '<button class="tombol abu" onclick="tutupDialog()">Nanti</button>');
    return false;
  }
  v.status = 'mengunggah'; v.room = room;
  try{ await simpanVideo(v); }
  catch(e){ if(!diam) pesan('Gagal menyimpan status klip: '+e.message); return false; }
  if(S.mediaGaleri === 'video') muatGaleriVideo();
  try{
    await MegaEngine.unggahVideo({
      blob: v.blob, nama: v.nama, room,
      namaPetugas: v.namaPetugas, ts: v.ts, durasi: v.durasi,
      lat: v.lat, lon: v.lon
    });
    v.status = 'terkirim'; v.pesanGagal = '';
    await simpanVideo(v);
    // Samakan dengan foto: bila pengguna memilih hapus setelah terkirim, klip
    // tidak menumpuk di memori HP. Pengaturan itu memang untuk menghemat ruang.
    if(S.hapusSetelahKirim){ try{ await hapusVideo(v.id); }catch(_){} }
    if(S.mediaGaleri === 'video') muatGaleriVideo();
    perbaruiJumlahVideo(); muatKlipTerbaru();
    if(!diam) pesan('Klip terkirim ke cloud room '+room);
    return true;
  }catch(e){
    v.status = 'gagal'; v.pesanGagal = e.message || 'gagal';
    await simpanVideo(v);
    if(S.mediaGaleri === 'video') muatGaleriVideo();
    if(!diam) pesan('Gagal kirim: '+e.message);
    return false;
  }
}

async function sinkronVideo(diam, paksa){
  if(sedangKirimVideo) return;
  if(typeof MegaEngine === 'undefined' || !MegaEngine.unggahVideo){
    if(!diam) pesan('Mesin cloud belum siap — tutup lalu buka lagi aplikasinya');
    return;
  }
  if(!navigator.onLine){ if(!diam) pesan('Tidak ada koneksi — klip tetap aman di HP'); return; }
  if(!paksa && !bolehUploadSekarang()){
    if(!diam) pesan('Upload otomatis dibuka mulai pukul 16.00 WIB. Klip akan dikirim sendiri saat waktunya tiba.');
    return;
  }
  const semua = await ambilSemuaVideo();
  const antri = semua.filter(v => v.status === 'lokal' || v.status === 'gagal' || !v.status);
  const siap = antri.filter(v => MegaEngine.bisaUpload((v.room && v.room!=='LOKAL') ? v.room : S.room));
  if(!siap.length){
    if(!diam){
      if(antri.length) pesan('Klip belum bisa dikirim: room belum terhubung ke Cloud MEGA');
      else pesan('Semua video sudah terkirim');
    }
    return;
  }
  sedangKirimVideo = true;
  let ok = 0, gagal = 0;
  try{
    if(!diam) pesan('Mengirim '+siap.length+' klip… jangan tutup aplikasi');
    for(const v of siap){
      const hasil = await kirimKlipVideo(v.id, true);
      if(hasil) ok++; else gagal++;
    }
  }finally{
    // Kunci harus selalu dilepas; kalau tidak, pengiriman video berhenti permanen
    // sampai aplikasi dibuka ulang (mis. saat penyimpanan HP penuh).
    sedangKirimVideo = false;
  }
  if(!diam) pesan(ok+' klip terkirim'+(gagal?', '+gagal+' gagal (dicoba lagi nanti)':''));
}


/* Dipanggil sekali oleh index.html setelah state dan DOM siap. */
function mulaiVideoUI(){
  S.mediaGaleri = 'foto';
/* ---------- Pasang kendali layar & galeri ---------- */
$('vidRekam').onclick = ()=> (V.rec && V.rec.state === 'recording') ? hentikanRekamVideo() : mulaiRekamVideo();
$('vidNative').onclick = rekamKameraHp;
$('vidBalik').onclick = async ()=>{
  if(V.rec && V.rec.state === 'recording'){ pesan('Hentikan rekaman dulu'); return; }
  S.facing = (S.facing === 'user') ? 'environment' : 'user';
  if(V.stream){ V.stream.getTracks().forEach(t=>t.stop()); V.stream = null; }
  await nyalakanVideo();
};
$('pemutarTutup').onclick = tutupPemutarVideo;
$('pemutarUnduh').onclick = async ()=>{
  if(!pemutarId) return;
  const v = (await ambilSemuaVideo()).find(x=>x.id===pemutarId); if(!v) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(v.blob);
  a.download = v.nama || 'video-kegiatan.mp4';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 6000);
};
$('pemutarHapus').onclick = ()=>{
  if(!pemutarId) return;
  const id = pemutarId;
  dialog('<h3>Hapus video ini?</h3><p>Klip akan hilang dari perangkat ini. Tindakan tidak bisa dibatalkan.</p>'+
    '<div class="baris-tombol"><button class="tombol abu" onclick="tutupDialog()" style="margin-top:0">Batal</button>'+
    '<button class="tombol" style="margin-top:0;background:var(--merah)" onclick="konfirmasiHapusVideo(\''+id+'\')">Hapus</button></div>');
};
window.konfirmasiHapusVideo = async id=>{
  await hapusVideo(id);
  tutupDialog(); tutupPemutarVideo();
  perbaruiJumlahVideo(); muatKlipTerbaru();
  if(S.mediaGaleri === 'video') muatGaleriVideo();
  pesan('Video dihapus');
};
document.querySelectorAll('#filterMedia button').forEach(b=> b.onclick = ()=>{
  S.mediaGaleri = b.dataset.media;
  document.querySelectorAll('#filterMedia button').forEach(x=>x.classList.toggle('pilih', x===b));
  if(S.mediaGaleri === 'video') muatGaleriVideo(); else muatGaleri(true);
});
  setTimeout(perbaruiJumlahVideo, 1200);
}
