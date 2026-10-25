/* Panel admin BPKH XI — Cloudflare Pages Function (pengganti backend Apps Script).
 * Basis data : D1, binding bernama DB (lihat db/schema.sql).
 * Rahasia    : env.TOKEN_ADMIN, diatur di dashboard Pages (JANGAN ditulis di kode).
 * Opsional   : env.ALAMAT_APLIKASI, alamat dasar aplikasi untuk link undangan.
 */

const VERSI = '3.0.0';
const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function balas(obj) {
  return new Response(JSON.stringify(obj), { headers: JSON_HDR });
}

function samaAman(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let beda = 0;
  for (let i = 0; i < a.length; i++) beda |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return beda === 0;
}

function wajibAdmin(p, env) {
  if (!env.TOKEN_ADMIN) throw new Error('TOKEN_ADMIN belum diatur di Cloudflare Pages');
  if (!samaAman(p.tokenAdmin, env.TOKEN_ADMIN)) throw new Error('Token admin salah');
}

function kodeAcak() {
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

/* Waktu dinding Asia/Jakarta (UTC+7), format yyyy-MM-dd HH:mm:ss. */
function waktuJakarta() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

function linkRoom(env, r) {
  return {
    nama: r.nama, folderId: '', linkFolder: '',
    token: r.token, dibuat: r.dibuat, aktif: !!r.aktif,
    linkUndangan: (env.ALAMAT_APLIKASI || '') + '/?room=' + encodeURIComponent(r.nama) + '&token=' + r.token
  };
}

export async function onRequestPost({ request, env }) {
  let p;
  try { p = JSON.parse(await request.text()); }
  catch (e) { return balas({ ok: false, pesan: 'Permintaan kosong' }); }
  try {
    switch (p.aksi) {
      case 'ping':           return balas({ ok: true, versi: VERSI });
      case 'adminMasuk':     return balas(await adminMasuk(p, env));
      case 'buatRoom':       return balas(await buatRoom(p, env));
      case 'daftarRoom':     return balas(await daftarRoom(p, env));
      case 'ubahRoom':       return balas(await ubahRoom(p, env));
      case 'daftarAnggota':  return balas(await daftarAnggota(p, env));
      case 'ubahAnggota':    return balas(await ubahAnggota(p, env));
      case 'rekapAdmin':     return balas(await rekapAdmin(p, env));
      case 'daftarAdmin':    return balas(await daftarAdmin(p, env));
      case 'ubahAdmin':      return balas(await ubahAdmin(p, env));
      case 'ambilTelemetri': return balas(await ambilTelemetri(p, env));
      case 'hitungPengguna': return balas(await hitungPengguna(env));
      default:               return balas({ ok: false, pesan: 'Aksi tidak dikenal: ' + p.aksi });
    }
  } catch (err) {
    return balas({ ok: false, pesan: 'Kesalahan server: ' + err.message });
  }
}

async function adminMasuk(p, env) {
  wajibAdmin(p, env);
  return {
    ok: true, versi: VERSI, folderMaster: '', alamatAplikasi: env.ALAMAT_APLIKASI || '',
    wajibLogin: false, domainKantor: '', sebagai: 'token admin', adminEmail: []
  };
}

async function buatRoom(p, env) {
  wajibAdmin(p, env);
  const nama = String(p.nama || '').trim();
  if (!nama) throw new Error('Nama room tidak boleh kosong');
  if (nama.length > 60) throw new Error('Nama room terlalu panjang (maks 60 karakter)');
  const ada = await env.DB.prepare('SELECT nama FROM rooms WHERE nama = ?').bind(nama).first();
  if (ada) throw new Error('Room "' + nama + '" sudah ada');
  const room = { nama, token: kodeAcak(), dibuat: new Date().toISOString(), aktif: 1 };
  await env.DB.prepare('INSERT INTO rooms (nama, token, dibuat, aktif) VALUES (?, ?, ?, ?)')
    .bind(room.nama, room.token, room.dibuat, room.aktif).run();
  return { ok: true, room: linkRoom(env, room) };
}

async function daftarRoom(p, env) {
  wajibAdmin(p, env);
  const hasil = await env.DB.prepare(
    "SELECT r.nama, r.token, r.dibuat, r.aktif, " +
    "(SELECT COUNT(*) FROM anggota a WHERE a.room = r.nama AND a.status = 'aktif') AS jml " +
    "FROM rooms r ORDER BY r.nama").all();
  return {
    ok: true,
    rooms: (hasil.results || []).map(r => Object.assign(linkRoom(env, r), { jumlahAnggota: r.jml || 0 }))
  };
}

async function ubahRoom(p, env) {
  wajibAdmin(p, env);
  const r = await env.DB.prepare('SELECT nama, token, dibuat, aktif FROM rooms WHERE nama = ?')
    .bind(String(p.nama || '')).first();
  if (!r) throw new Error('Room tidak ditemukan');
  if (p.perintah === 'nonaktifkan') r.aktif = 0;
  else if (p.perintah === 'aktifkan') r.aktif = 1;
  else if (p.perintah === 'tokenBaru') r.token = kodeAcak();
  else throw new Error('Perintah tidak dikenal');
  await env.DB.prepare('UPDATE rooms SET token = ?, aktif = ? WHERE nama = ?')
    .bind(r.token, r.aktif, r.nama).run();
  return { ok: true, room: linkRoom(env, r) };
}

async function daftarAnggota(p, env) {
  wajibAdmin(p, env);
  const saring = String(p.room || '');
  const hasil = saring
    ? await env.DB.prepare('SELECT room, email, nama, bergabung, status FROM anggota WHERE room = ? ORDER BY email').bind(saring).all()
    : await env.DB.prepare('SELECT room, email, nama, bergabung, status FROM anggota ORDER BY room, email').all();
  return { ok: true, anggota: (hasil.results || []).map(a => ({ ...a, baris: null })) };
}

async function ubahAnggota(p, env) {
  wajibAdmin(p, env);
  const status = p.perintah === 'keluarkan' ? 'nonaktif'
               : p.perintah === 'aktifkan' ? 'aktif' : null;
  if (!status) throw new Error('Perintah tidak dikenal');
  const email = String(p.email || '').toLowerCase();
  const hasil = await env.DB.prepare('UPDATE anggota SET status = ? WHERE room = ? AND email = ?')
    .bind(status, String(p.room || ''), email).run();
  if (!hasil.meta || hasil.meta.changes === 0) throw new Error('Anggota tidak ditemukan');
  return { ok: true, email, status };
}

/* Foto lapangan kini tersimpan di MEGA, bukan di basis data ini. Panel rekap
 * dan galeri belum punya sumbernya, jadi selalu kosong. */
async function rekapAdmin(p, env) {
  wajibAdmin(p, env);
  return { ok: true, data: [], pesan: 'Data foto ada di MEGA; rekap belum ditampilkan di panel ini' };
}

/* Admin sekarang masuk dengan token. Pengelolaan admin lewat email (yang
 * dulu dipakai untuk login Google) tidak lagi berlaku. */
async function daftarAdmin(p, env) {
  wajibAdmin(p, env);
  return { ok: true, tetap: [], tambahan: [], saya: '' };
}

async function ubahAdmin(p, env) {
  wajibAdmin(p, env);
  throw new Error('Pengelolaan admin lewat email sudah dinonaktifkan. Panel memakai token admin.');
}

async function ambilTelemetri(p, env) {
  wajibAdmin(p, env);
  const hasil = await env.DB.prepare(
    'SELECT device_id, nama, user_id, room, platform, mode_tampilan, versi, pertama_kali, ' +
    'terakhir_aktif, total_sesi, kunci FROM telemetri ORDER BY terakhir_aktif DESC').all();
  const baris = hasil.results || [];
  const batas7 = Date.now() - 7 * 24 * 3600 * 1000;
  let aktif7Hari = 0, apkPwa = 0;
  const daftar = baris.map(b => {
    const t = Date.parse(String(b.terakhir_aktif).replace(' ', 'T') + '+07:00');
    const isAktif = !isNaN(t) && t >= batas7;
    if (isAktif) aktif7Hari++;
    const mode = String(b.mode_tampilan || '').toLowerCase();
    if (mode.indexOf('pwa') >= 0 || mode.indexOf('apk') >= 0) apkPwa++;
    return {
      deviceId: b.device_id, nama: b.nama, userId: b.user_id, room: b.room,
      platform: b.platform, modeTampilan: b.mode_tampilan, versi: b.versi,
      pertamaKali: b.pertama_kali, terakhirAktif: b.terakhir_aktif,
      totalSesi: b.total_sesi, kunci: b.kunci || '', isAktif
    };
  });
  return {
    ok: true, total: daftar.length, totalPengguna: await hitungUnik(env),
    aktif7Hari, apkPwa, daftar
  };
}

/* Hitungan pengguna = identitas unik (akun MEGA, atau perangkat bila belum login).
 * Jumlah kunjungan dan foto tidak dipakai. Publik, hanya mengembalikan angka. */
async function hitungUnik(env) {
  const r = await env.DB.prepare(
    "SELECT COUNT(DISTINCT CASE WHEN kunci IS NOT NULL AND kunci <> '' THEN kunci " +
    "ELSE 'perangkat:' || device_id END) AS n FROM telemetri").first();
  return (r && r.n) || 0;
}

async function hitungPengguna(env) {
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM telemetri').first();
  return { ok: true, totalPengguna: await hitungUnik(env), totalPerangkat: (total && total.n) || 0 };
}
