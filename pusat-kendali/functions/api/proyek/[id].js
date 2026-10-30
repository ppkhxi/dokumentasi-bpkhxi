import { cariProyek } from "../../_lib/proyek.js";
import { github, supabase, cloudflare, penyimpanan, perhatian } from "../../_lib/sumber.js";

const SIMPAN_DETIK = 60;

export async function onRequestGet({ request, params, env, waitUntil }) {
  const p = cariProyek(params.id);
  if (!p) return Response.json({ error: "Proyek tidak ditemukan." }, { status: 404 });

  // Cache singkat per proyek agar tidak menghabiskan kuota API; ?segar=1 melewatinya.
  const url = new URL(request.url);
  const kunci = new Request(`${url.origin}/__cache/proyek/${p.id}`);
  const cache = caches.default;
  if (url.searchParams.get("segar") !== "1") {
    const lama = await cache.match(kunci);
    if (lama) return new Response(lama.body, { headers: { "content-type": "application/json", "cache-control": "no-store", "x-dari-cache": "1" } });
  }

  const [gh, sb, cf, st] = await Promise.all([
    github(p.github, env),
    supabase(p.supabase, env),
    cloudflare(p.cloudflare, env),
    penyimpanan(p.penyimpanan, p.cloudflare, env),
  ]);
  const hasil = { id: p.id, nama: p.nama, deskripsi: p.deskripsi, diambil: new Date().toISOString(), github: gh, supabase: sb, cloudflare: cf, penyimpanan: st };
  hasil.perhatian = perhatian(hasil);

  const body = JSON.stringify(hasil);
  waitUntil(cache.put(kunci, new Response(body, { headers: { "content-type": "application/json", "cache-control": `max-age=${SIMPAN_DETIK}` } })));
  return new Response(body, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
