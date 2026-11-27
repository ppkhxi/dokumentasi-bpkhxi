/* ===========================================================================
   DKPOINT — UTILITAS UMUM

   Kumpulan fungsi kecil tanpa efek samping saat dimuat: pemilih elemen,
   escape HTML, format waktu, dan identitas perangkat. Dimuat paling awal
   supaya skrip lain (peta.js, mega-engine.js, dan skrip utama) bisa memakai
   fungsi yang sama tanpa duplikasi.

   Aturan: jangan menaruh kode yang menyentuh DOM di top-level berkas ini.
   =========================================================================== */

const $ = id => document.getElementById(id);

/* Escape untuk disisipkan ke innerHTML. Jangan dipakai untuk teks yang
   nantinya masuk ke atribut onclick — pakai data-* dan pasang handler. */
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function labelStatus(f){
  if(f.status==='terkirim') return 'Terkirim ke Cloud';
  if(f.status==='lokal') return 'Tersimpan di HP (Lokal)';
  if(f.status==='gagal') return 'Gagal kirim';
  return 'Menunggu upload';
}

function kelasTanda(f){
  if(f.status==='lokal') return 'lokal';
  if(f.status==='terkirim' && f.simulasi) return 'simulasi';
  return f.status || 'pending';
}

/* Jam WIB (Asia/Jakarta) — dipakai untuk jendela upload pukul 16.00. */
function jamWIB(){
  try { return parseInt(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'numeric',hourCycle:'h23'}).format(new Date()),10); }
  catch(_) { return new Date().getHours(); }
}

const fmtWaktu = ts => new Date(ts).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});

function durasiTeks(detik){
  detik = Math.max(0, Math.round(detik || 0));
  return String(Math.floor(detik/60)).padStart(2,'0')+':'+String(detik%60).padStart(2,'0');
}

function hitungInisialPetugas(name){
  if(!name) return '';
  const kata = name.trim().split(/\s+/).filter(Boolean);
  if(!kata.length) return '';
  if(kata.length === 1){
    return kata[0].substring(0, 4).toUpperCase();
  }
  return kata.map(w => w.charAt(0).toUpperCase()).join('').substring(0, 4);
}

/* ---------- Identitas perangkat & telemetri ---------- */
function dapatkanDeviceId(){
  let id = localStorage.getItem('dkpoint_device_id');
  if(!id){
    id = 'dkp_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    localStorage.setItem('dkpoint_device_id', id);
    localStorage.setItem('dkpoint_pertama_kali', new Date().toISOString());
  }
  return id;
}

function catatSesiPengguna(){
  const jml = parseInt(localStorage.getItem('dkpoint_jml_sesi') || '0', 10) + 1;
  localStorage.setItem('dkpoint_jml_sesi', jml);
  localStorage.setItem('dkpoint_terakhir_aktif', new Date().toISOString());
  return jml;
}

function deteksiPlatform(){
  const ua = navigator.userAgent || '';
  if(/android/i.test(ua)) return 'Android';
  if(/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if(/windows/i.test(ua)) return 'Windows';
  if(/macintosh|mac os x/i.test(ua)) return 'macOS';
  if(/linux/i.test(ua)) return 'Linux';
  return 'Lainnya';
}

function deteksiModeTampilan(){
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  return standalone ? 'PWA / APK Terpasang' : 'Browser Web';
}
