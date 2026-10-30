import { MAKS_BYTE, bucket, dariHalamanSendiri, galat, namaSah, periksaProyek } from "../../../_lib/unduhan.js";

function siapkan(params, env) {
  const tolak = periksaProyek(params.proyek);
  if (tolak) return { tolak };
  if (!namaSah(params.nama)) return { tolak: galat("Nama file tidak diizinkan. Pakai huruf, angka, titik, minus, dan ekstensi aplikasi (apk, aab, zip, exe, msi, dmg, ipa, pdf).") };
  const r2 = bucket(env);
  if (!r2) return { tolak: galat("Penyimpanan aplikasi belum diatur (binding R2 UNDUHAN).", 503) };
  return { r2, kunci: `${params.proyek}/${params.nama}` };
}

// GET: unduh file.
export async function onRequestGet({ params, env }) {
  const { tolak, r2, kunci } = siapkan(params, env);
  if (tolak) return tolak;
  const obj = await r2.get(kunci);
  if (!obj) return galat("File tidak ditemukan.", 404);
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("content-type", h.get("content-type") || "application/octet-stream");
  h.set("content-disposition", `attachment; filename="${params.nama}"`);
  h.set("content-length", String(obj.size));
  h.set("cache-control", "private, no-store");
  return new Response(obj.body, { headers: h });
}

// PUT: unggah file (body = isi file). Menimpa file dengan nama yang sama.
export async function onRequestPut({ request, params, env, data }) {
  if (!dariHalamanSendiri(request)) return galat("Permintaan ditolak.", 403);
  const { tolak, r2, kunci } = siapkan(params, env);
  if (tolak) return tolak;
  const panjang = Number(request.headers.get("content-length") || 0);
  if (!panjang) return galat("File kosong.");
  if (panjang > MAKS_BYTE) return galat("File lebih dari 95 MB. Unggah lewat dashboard R2.", 413);
  const tipe = params.nama.endsWith(".apk") ? "application/vnd.android.package-archive" : request.headers.get("content-type") || "application/octet-stream";
  await r2.put(kunci, request.body, { httpMetadata: { contentType: tipe }, customMetadata: { oleh: data.email || "" } });
  return Response.json({ ok: true, nama: params.nama });
}

// DELETE: hapus file.
export async function onRequestDelete({ request, params, env }) {
  if (!dariHalamanSendiri(request)) return galat("Permintaan ditolak.", 403);
  const { tolak, r2, kunci } = siapkan(params, env);
  if (tolak) return tolak;
  await r2.delete(kunci);
  return Response.json({ ok: true });
}
