/* Feedback & masukan pengguna dkpoint — Cloudflare Pages Function.
 * - Kirim masukan (tanpa aksi): menyimpan satu baris ke tabel `masukan` di D1 (binding DB).
 * - Daftar masukan (aksi "daftar"): hanya untuk email yang ada di ADMIN_MASUKAN. */

const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

// Email yang boleh melihat daftar masukan di menu Pengaturan.
const ADMIN_MASUKAN = ['iqbalpas45@gmail.com', 'nufaart@gmail.com'];

function balas(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HDR });
}

function teks(v, maks) {
  return String(v == null ? '' : v).trim().slice(0, maks);
}

function waktuJakarta() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

async function pastikanTabel(env) {
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS masukan (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, nama TEXT, ' +
    'user_id TEXT, room TEXT, platform TEXT, versi TEXT, bintang INTEGER NOT NULL, pesan TEXT, waktu TEXT NOT NULL)'
  ).run();
}

export async function onRequestPost({ request, env }) {
  let p;
  try { p = JSON.parse(await request.text()); }
  catch (e) { return balas({ ok: false, pesan: 'Permintaan tidak valid' }, 400); }

  if (p.aksi === 'daftar') {
    const email = teks(p.email, 120).toLowerCase();
    if (!ADMIN_MASUKAN.includes(email)) return balas({ ok: false, pesan: 'Tidak berhak' }, 403);
    try {
      await pastikanTabel(env);
      const rows = await env.DB.prepare(
        'SELECT waktu, bintang, nama, room, platform, versi, pesan FROM masukan ORDER BY id DESC LIMIT 200'
      ).all();
      const stat = await env.DB.prepare('SELECT COUNT(*) AS jumlah, AVG(bintang) AS rata FROM masukan').first();
      return balas({
        ok: true,
        jumlah: stat ? stat.jumlah : 0,
        rata: stat && stat.rata ? Math.round(stat.rata * 10) / 10 : 0,
        data: rows.results || []
      });
    } catch (err) {
      return balas({ ok: false, pesan: 'Gagal memuat masukan' }, 500);
    }
  }

  const bintang = parseInt(p.bintang, 10);
  if (!(bintang >= 1 && bintang <= 5)) return balas({ ok: false, pesan: 'Bintang harus 1 sampai 5' }, 400);

  try {
    await pastikanTabel(env);
    await env.DB.prepare(
      'INSERT INTO masukan (device_id, nama, user_id, room, platform, versi, bintang, pesan, waktu) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      teks(p.deviceId, 100), teks(p.nama, 120), teks(p.userId, 120), teks(p.room, 120),
      teks(p.platform, 40), teks(p.versi, 20), bintang, teks(p.pesan, 1000), waktuJakarta()
    ).run();
  } catch (err) {
    return balas({ ok: false, pesan: 'Gagal menyimpan masukan' }, 500);
  }
  return balas({ ok: true });
}
