// Pengambil data per platform. Setiap fungsi mengembalikan objek dengan `status`:
//   "ok"              data berhasil diambil
//   "tidak-dipakai"   proyek ini tidak memakai platform tersebut
//   "menunggu-akses"  token/akun belum diisi atau belum punya izin
//   "gagal"           API membalas error; `pesan` berisi alasannya

const UA = "pusat-kendali";

class AksesDitolak extends Error {}

async function ambilJson(url, headers = {}) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json", ...headers } });
  const teks = await res.text();
  let data = null;
  try { data = JSON.parse(teks); } catch {}
  if (res.status === 401 || res.status === 403) throw new AksesDitolak(pesanDari(data, teks, res.status));
  if (!res.ok) throw new Error(pesanDari(data, teks, res.status));
  return data;
}

function pesanDari(data, teks, status) {
  const m = data?.message || data?.errors?.[0]?.message || data?.error || teks.slice(0, 160);
  return `${status}: ${m}`;
}

async function aman(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AksesDitolak) return { status: "menunggu-akses", pesan: e.message };
    return { status: "gagal", pesan: e.message };
  }
}

const detik = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000)) : null);

// ---------- GitHub ----------

export function github(cfg, env) {
  if (!cfg) return { status: "tidak-dipakai" };
  if (!cfg.repo?.length) return { status: "menunggu-akses", pesan: "Belum ada repo yang dipilih untuk proyek ini." };
  const token = env[cfg.token];
  const h = { "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  return aman(async () => {
    const repo = await Promise.all(cfg.repo.map(async (nama) => {
      const [info, runs] = await Promise.all([
        ambilJson(`https://api.github.com/repos/${nama}`, h),
        ambilJson(`https://api.github.com/repos/${nama}/actions/runs?per_page=10`, h),
      ]);
      return {
        nama,
        url: info.html_url,
        cabang: info.default_branch,
        privat: info.private,
        totalProses: runs.total_count,
        proses: runs.workflow_runs.map((r) => ({
          id: String(r.id),
          workflow: r.name,
          judul: (r.display_title || r.head_commit?.message || "").split("\n")[0],
          hasil: r.conclusion || r.status,
          mulai: r.run_started_at || r.created_at,
          durasi: r.status === "completed" ? detik(r.run_started_at || r.created_at, r.updated_at) : null,
          url: r.html_url,
        })),
      };
    }));
    return { status: "ok", tanpaToken: !token, repo };
  });
}

// ---------- Supabase ----------

export function supabase(cfg, env) {
  if (!cfg) return { status: "tidak-dipakai" };
  const token = env[cfg.token];
  if (!token) return { status: "menunggu-akses", pesan: `Secret ${cfg.token} belum diisi.` };
  return aman(async () => {
    const semua = await ambilJson("https://api.supabase.com/v1/projects", { authorization: `Bearer ${token}` });
    const dipilih = cfg.proyek?.length ? semua.filter((p) => cfg.proyek.includes(p.id || p.ref)) : semua;
    return {
      status: "ok",
      proyek: dipilih.map((p) => ({
        nama: p.name,
        ref: p.id || p.ref,
        status: p.status,
        region: p.region,
        postgres: p.database?.version || null,
        dibuat: p.created_at,
        url: `https://supabase.com/dashboard/project/${p.id || p.ref}`,
      })),
    };
  });
}

// ---------- Cloudflare ----------

function cfKredensial(cfg, env) {
  if (!cfg) return null;
  return { akun: env[cfg.akun], token: env[cfg.token], namaAkun: cfg.akun, namaToken: cfg.token };
}

const cfApi = (k, path) =>
  ambilJson(`https://api.cloudflare.com/client/v4/accounts/${k.akun}${path}`, { authorization: `Bearer ${k.token}` });

export function cloudflare(cfg, env) {
  if (!cfg || (!cfg.pages?.length && !cfg.d1?.length)) return { status: "tidak-dipakai" };
  const k = cfKredensial(cfg, env);
  if (!k.akun || !k.token) return { status: "menunggu-akses", pesan: `Secret ${k.namaAkun} / ${k.namaToken} belum diisi.` };
  return aman(async () => {
    const [pages, d1] = await Promise.all([
      Promise.all((cfg.pages || []).map(async (nama) => {
        const p = (await cfApi(k, `/pages/projects/${encodeURIComponent(nama)}`)).result;
        const d = p.latest_deployment;
        return {
          nama: p.name,
          cabang: p.production_branch,
          domain: p.domains?.[0] || p.subdomain,
          status: d?.latest_stage?.status || null,
          tahap: d?.latest_stage?.name || null,
          diperbarui: d?.created_on || null,
          url: `https://dash.cloudflare.com/${k.akun}/pages/view/${encodeURIComponent(p.name)}`,
        };
      })),
      (async () => {
        if (!cfg.d1?.length) return [];
        const daftar = (await cfApi(k, "/d1/database?per_page=100")).result || [];
        const dipilih = daftar.filter((d) => cfg.d1.includes(d.name));
        return Promise.all(dipilih.map(async (d) => {
          const det = (await cfApi(k, `/d1/database/${d.uuid}`)).result;
          return {
            nama: det.name,
            uuid: det.uuid,
            tabel: det.num_tables,
            ukuran: det.file_size,
            dibuat: det.created_at,
            url: `https://dash.cloudflare.com/${k.akun}/workers/d1/databases/${det.uuid}`,
          };
        }));
      })(),
    ]);
    return { status: "ok", pages, d1, dasbor: `https://dash.cloudflare.com/${k.akun}/workers-and-pages` };
  });
}

// ---------- Penyimpanan ----------

export async function penyimpanan(cfgPenyimpanan, cfgCloudflare, env) {
  const tautan = cfgPenyimpanan?.tautan || [];
  const namaR2 = cfgPenyimpanan?.r2 || [];
  let r2 = { status: "tidak-dipakai" };
  if (namaR2.length) {
    const k = cfKredensial(cfgCloudflare, env);
    if (!k?.akun || !k?.token) {
      r2 = { status: "menunggu-akses", pesan: "Akun Cloudflare proyek ini belum diisi." };
    } else {
      r2 = await aman(async () => {
        const hasil = (await cfApi(k, "/r2/buckets?per_page=100")).result;
        const semua = hasil?.buckets || [];
        return {
          status: "ok",
          bucket: semua.filter((b) => namaR2.includes(b.name)).map((b) => ({
            nama: b.name,
            dibuat: b.creation_date,
            lokasi: b.location || null,
            url: `https://dash.cloudflare.com/${k.akun}/r2/default/buckets/${encodeURIComponent(b.name)}`,
          })),
        };
      });
    }
  }
  const status = r2.status === "ok" || tautan.length ? "ok" : r2.status;
  return { status, r2, tautan };
}

// ---------- Hal yang perlu dicek ----------

export function perhatian(d) {
  const out = [];
  if (d.github.status === "ok") {
    for (const r of d.github.repo) {
      for (const p of r.proses.filter((p) => p.hasil === "failure")) {
        out.push({ bagian: "GitHub", tingkat: "gagal", pesan: `${p.workflow} gagal: ${p.judul}` });
      }
    }
  }
  if (d.supabase.status === "ok") {
    for (const p of d.supabase.proyek.filter((p) => p.status !== "ACTIVE_HEALTHY")) {
      out.push({ bagian: "Supabase", tingkat: "peringatan", pesan: `Proyek ${p.nama} berstatus ${p.status}` });
    }
  }
  if (d.cloudflare.status === "ok") {
    for (const db of d.cloudflare.d1.filter((x) => x.tabel === 0)) {
      out.push({ bagian: "Cloudflare", tingkat: "peringatan", pesan: `Database D1 ${db.nama} belum punya tabel` });
    }
    for (const p of d.cloudflare.pages.filter((x) => x.status === "failure")) {
      out.push({ bagian: "Cloudflare", tingkat: "gagal", pesan: `Deploy Pages ${p.nama} gagal` });
    }
  }
  for (const [bagian, nama] of [["github", "GitHub"], ["supabase", "Supabase"], ["cloudflare", "Cloudflare"]]) {
    if (d[bagian].status === "gagal") out.push({ bagian: nama, tingkat: "gagal", pesan: `Data tidak bisa diambil (${d[bagian].pesan})` });
  }
  return out;
}
