/* Telemetri pengguna aplikasi dkpoint — Cloudflare Pages Function.
 * Menulis satu baris per perangkat (upsert) ke tabel `telemetri` di D1 (binding DB). */

const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function balas(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HDR });
}

function teks(v, maks) {
  return String(v == null ? '' : v).slice(0, maks);
}

function waktuJakarta() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

export async function onRequestPost({ request, env }) {
  let p;
  try { p = JSON.parse(await request.text()); }
  catch (e) { return balas({ ok: false, pesan: 'Permintaan tidak valid' }, 400); }

  const deviceId = teks(p.deviceId, 100);
  if (!deviceId) return balas({ ok: false, pesan: 'Device ID wajib ada' }, 400);

  const sekarang = waktuJakarta();
  const jmlSesi = Math.max(0, parseInt(p.jmlSesi, 10) || 0);
  try {
    await env.DB.prepare(
      'INSERT INTO telemetri (device_id, nama, user_id, room, platform, mode_tampilan, versi, ' +
      'pertama_kali, terakhir_aktif, total_sesi, layar, kunci) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(device_id) DO UPDATE SET nama = excluded.nama, user_id = excluded.user_id, ' +
      'room = excluded.room, platform = excluded.platform, mode_tampilan = excluded.mode_tampilan, ' +
      'versi = excluded.versi, terakhir_aktif = excluded.terakhir_aktif, ' +
      'total_sesi = excluded.total_sesi, layar = excluded.layar, kunci = excluded.kunci'
    ).bind(
      deviceId, teks(p.nama, 120), teks(p.userId, 120), teks(p.room, 120),
      teks(p.platform, 40), teks(p.modeTampilan, 60), teks(p.versi, 20),
      teks(p.pertamaKali, 30) || sekarang, sekarang, jmlSesi,
      teks(p.layar, 20), teks(p.kunci, 200)
    ).run();
  } catch (err) {
    return balas({ ok: false, pesan: 'Gagal mencatat telemetri' }, 500);
  }
  return balas({ ok: true });
}
