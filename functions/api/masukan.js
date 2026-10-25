/* Feedback & masukan pengguna dkpoint — Cloudflare Pages Function.
 * Menyimpan satu baris per kiriman ke tabel `masukan` di D1 (binding DB). */

const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function balas(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HDR });
}

function teks(v, maks) {
  return String(v == null ? '' : v).trim().slice(0, maks);
}

function waktuJakarta() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

export async function onRequestPost({ request, env }) {
  let p;
  try { p = JSON.parse(await request.text()); }
  catch (e) { return balas({ ok: false, pesan: 'Permintaan tidak valid' }, 400); }

  const bintang = parseInt(p.bintang, 10);
  if (!(bintang >= 1 && bintang <= 5)) return balas({ ok: false, pesan: 'Bintang harus 1 sampai 5' }, 400);

  try {
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS masukan (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, nama TEXT, ' +
      'user_id TEXT, room TEXT, platform TEXT, versi TEXT, bintang INTEGER NOT NULL, pesan TEXT, waktu TEXT NOT NULL)'
    ).run();
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
