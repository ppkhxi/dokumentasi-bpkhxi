// Verifikasi token Cloudflare Access (header Cf-Access-Jwt-Assertion).
// Wajib diisi: ACCESS_TEAM_DOMAIN (mis. https://namatim.cloudflareaccess.com) dan ACCESS_AUD.
// Untuk uji lokal saja: IZINKAN_TANPA_ACCESS=1.

let cacheKunci = { domain: null, kunci: null, waktu: 0 };

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const jsonDari = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

async function kunciAccess(domain) {
  if (cacheKunci.domain === domain && Date.now() - cacheKunci.waktu < 3600_000) return cacheKunci.kunci;
  const res = await fetch(`${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("Tidak bisa mengambil kunci Access");
  const { keys } = await res.json();
  cacheKunci = { domain, kunci: keys, waktu: Date.now() };
  return keys;
}

export async function periksaAkses(request, env) {
  if (env.IZINKAN_TANPA_ACCESS === "1") return { ok: true, email: "lokal" };
  const domain = (env.ACCESS_TEAM_DOMAIN || "").replace(/\/$/, "");
  const aud = env.ACCESS_AUD;
  if (!domain || !aud) return { ok: false, pesan: "Cloudflare Access belum dikonfigurasi (ACCESS_TEAM_DOMAIN / ACCESS_AUD)." };

  const jwt = request.headers.get("cf-access-jwt-assertion");
  if (!jwt) return { ok: false, pesan: "Tidak ada sesi Cloudflare Access." };
  const [h, p, s] = jwt.split(".");
  if (!h || !p || !s) return { ok: false, pesan: "Token Access tidak valid." };

  try {
    const header = jsonDari(h);
    const isi = jsonDari(p);
    const jwk = (await kunciAccess(domain)).find((k) => k.kid === header.kid);
    if (!jwk) return { ok: false, pesan: "Kunci Access tidak dikenal." };
    const kunci = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const sah = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", kunci, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    const audOk = Array.isArray(isi.aud) ? isi.aud.includes(aud) : isi.aud === aud;
    if (!sah || !audOk || isi.iss !== domain || isi.exp * 1000 < Date.now()) return { ok: false, pesan: "Token Access ditolak." };
    return { ok: true, email: isi.email };
  } catch {
    return { ok: false, pesan: "Token Access tidak bisa diverifikasi." };
  }
}
