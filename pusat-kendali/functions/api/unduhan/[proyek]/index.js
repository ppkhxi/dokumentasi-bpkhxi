import { bucket, galat, periksaProyek } from "../../../_lib/unduhan.js";

// GET /api/unduhan/:proyek → daftar file aplikasi proyek itu, terbaru dulu.
export async function onRequestGet({ params, env }) {
  const tolak = periksaProyek(params.proyek);
  if (tolak) return tolak;
  const r2 = bucket(env);
  if (!r2) return Response.json({ status: "belum-diatur", file: [] }, { headers: { "cache-control": "no-store" } });

  const file = [];
  let cursor;
  do {
    const hasil = await r2.list({ prefix: `${params.proyek}/`, cursor, include: ["customMetadata"] });
    for (const o of hasil.objects) {
      file.push({
        nama: o.key.slice(params.proyek.length + 1),
        ukuran: o.size,
        diunggah: o.uploaded,
        oleh: o.customMetadata?.oleh || null,
      });
    }
    cursor = hasil.truncated ? hasil.cursor : undefined;
  } while (cursor && file.length < 1000);

  file.sort((a, b) => new Date(b.diunggah) - new Date(a.diunggah));
  return Response.json({ status: "ok", file }, { headers: { "cache-control": "no-store" } });
}

export const onRequest = () => galat("Metode tidak didukung.", 405);
