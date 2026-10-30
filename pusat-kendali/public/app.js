// Pusat Kendali: pemilih proyek + 4 bagian (A GitHub, B Supabase, C Cloudflare, D Penyimpanan).
// Semua teks status ditulis sebagai kata (bukan hanya warna) supaya mudah dibaca Claude in Chrome.

const $ = (s) => document.querySelector(s);

function el(tag, attrs = {}, ...anak) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style") e.setAttribute("style", v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const a of anak.flat(Infinity)) if (a != null && a !== false) e.append(a instanceof Node ? a : String(a));
  return e;
}

const link = (teks, href, cls = "") => el("a", { href, target: "_blank", rel: "noopener", class: cls }, teks);

const fmtWaktu = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const fmtTgl = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const fmtJam = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const waktu = (v) => (v ? fmtWaktu.format(new Date(v)) : "–");
const tgl = (v) => (v ? fmtTgl.format(new Date(v)) : "–");
const angka = (n) => (n == null ? "–" : new Intl.NumberFormat("id-ID").format(n));
const ukuran = (b) => {
  if (b == null || isNaN(b)) return "–";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return (i ? b.toFixed(1).replace(".", ",") : b) + " " + u[i];
};

const stat = (n, label, nada) => el("div", { class: "st" }, el("span", { class: "n " + (nada || "") }, n), el("span", { class: "l" }, label));
const pill = (teks, nada) => el("span", { class: `pill ${nada}` }, teks);

const WARNA = { A: "var(--gh)", B: "var(--sb)", C: "var(--cf)", D: "var(--st)" };

function bagian(huruf, judul, akun, tombolList, isi, dim) {
  const id = `bagian-${huruf.toLowerCase()}`;
  return el("section", { class: "p" + (dim ? " dim" : ""), id, "aria-labelledby": id + "-j" },
    el("div", { class: "ph" },
      el("div", { class: "letter", style: `background:${WARNA[huruf]}`, "aria-hidden": "true" }, huruf),
      el("h3", { id: id + "-j" }, judul),
      akun ? el("span", { class: "acct" }, akun) : null,
      el("div", { class: "btns" }, tombolList.map(([t, h], i) => {
        const a = link(t, h, "btn" + (i === tombolList.length - 1 ? " pri" : ""));
        if (i === tombolList.length - 1) a.style.background = WARNA[huruf];
        return a;
      })),
    ),
    el("div", { class: "pb" }, isi),
  );
}

function kosong(judul, teks, langkah) {
  return el("div", { class: "empty" },
    el("h4", {}, judul),
    el("p", {}, teks),
    langkah?.length ? el("ol", {}, langkah.map((l) => el("li", {}, l))) : null,
  );
}

// Bagian yang belum siap (tidak dipakai / menunggu akses / gagal).
function bukanOk(d, nama, langkahAkses) {
  if (d.status === "tidak-dipakai") return kosong(`Proyek ini tidak memakai ${nama}`, `Kalau nanti ada sumber daya ${nama} untuk proyek ini, tambahkan di pengaturan proyek dan bagian ini akan terisi.`);
  if (d.status === "menunggu-akses") return kosong(`Menunggu akses ${nama}`, d.pesan || "Akun induk belum punya akses ke akun proyek ini.", langkahAkses);
  return kosong(`Data ${nama} gagal diambil`, d.pesan || "Coba muat ulang beberapa saat lagi.");
}

// ---------- A: GitHub ----------

function grafikDurasi(proses) {
  const data = proses.filter((p) => p.durasi != null).slice().reverse();
  if (!data.length) return null;
  const W = 360, H = 150, ml = 32, mb = 22, mt = 14;
  const max = Math.max(30, Math.ceil(Math.max(...data.map((d) => d.durasi)) / 30) * 30);
  const sy = (v) => mt + (H - mt - mb) * (1 - v / max);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Durasi proses GitHub Actions dalam detik: " + data.map((d) => `${namaWorkflow(d.workflow)} ${d.durasi} detik`).join(", "));
  const tambah = (tag, a, teks) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); if (teks != null) e.textContent = teks; svg.append(e); };
  for (let i = 0; i <= 4; i++) {
    const t = Math.round((max / 4) * i);
    tambah("line", { x1: ml, x2: W, y1: sy(t), y2: sy(t), class: "grid-l" });
    tambah("text", { x: ml - 6, y: sy(t) + 3.5, "text-anchor": "end" }, t);
  }
  const bw = (W - ml) / data.length;
  data.forEach((d, i) => {
    const x = ml + i * bw + bw * 0.18, w = bw * 0.64, y = sy(d.durasi);
    const warna = d.hasil === "failure" ? "var(--bad)" : d.hasil === "cancelled" ? "var(--warn)" : /apk/i.test(d.workflow) ? "var(--muted)" : "var(--gh)";
    tambah("rect", { x, y, width: w, height: H - mb - y, rx: 3, fill: warna, opacity: d.hasil === "cancelled" ? 0.45 : 1 });
    tambah("text", { x: x + w / 2, y: y - 4, "text-anchor": "middle" }, d.durasi);
  });
  tambah("text", { x: ml, y: H - 6 }, fmtJam.format(new Date(data[0].mulai)));
  tambah("text", { x: W, y: H - 6, "text-anchor": "end" }, fmtJam.format(new Date(data[data.length - 1].mulai)) + " WIB");
  return svg;
}

const namaWorkflow = (w) => (w === "pages build and deployment" ? "Deploy Pages" : w);
const nadaHasil = (h) => (h === "success" ? "ok" : h === "failure" ? "bad" : h === "cancelled" ? "mut" : "warn");

function bagianGithub(d) {
  if (d.status !== "ok") {
    return bagian("A", "GitHub", "belum tersambung", [["GitHub", "https://github.com"]],
      bukanOk(d, "GitHub", ["Undang akun induk ke repo atau organisasi proyek", "Pasang aplikasi GitHub Claude di repo itu", "Isi daftar repo dan token di pengaturan proyek"]),
      d.status !== "gagal");
  }
  const isi = d.repo.map((r) => {
    const sukses = r.proses.filter((p) => p.hasil === "success").length;
    const gagal = r.proses.filter((p) => p.hasil === "failure").length;
    const batal = r.proses.filter((p) => p.hasil === "cancelled").length;
    const tabel = el("table", { "aria-label": `Proses terakhir ${r.nama}` },
      el("thead", {}, el("tr", {}, el("th", {}, "Workflow"), el("th", {}, "Commit"), el("th", {}, "Hasil"), el("th", {}, "Waktu"))),
      el("tbody", {}, r.proses.slice(0, 6).map((p) =>
        el("tr", {}, el("td", {}, namaWorkflow(p.workflow)), el("td", { class: "teks", title: p.judul }, link(p.judul, p.url)), el("td", {}, pill(p.hasil, nadaHasil(p.hasil))), el("td", {}, waktu(p.mulai))))));
    const grafik = grafikDurasi(r.proses);
    return [
      el("p", { class: "sub" }, r.nama + (r.privat ? " · privat" : "") + ` · ${r.cabang}`),
      el("div", { class: "stats" },
        stat(angka(r.totalProses), "Total proses Actions"),
        stat(el("span", {}, String(sukses), el("small", {}, `/${r.proses.length}`)), "Berhasil (terakhir)", "ok"),
        stat(gagal, "Gagal", gagal ? "bad" : ""),
        stat(batal, "Dibatalkan")),
      el("div", { class: "cols" },
        grafik ? el("div", {}, el("p", { class: "sub" }, "Durasi proses (detik)"), grafik,
          el("div", { class: "legend" }, el("span", {}, el("i", { style: "background:var(--gh)" }), "Deploy"), el("span", {}, el("i", { style: "background:var(--muted)" }), "Build APK"), el("span", {}, el("i", { style: "background:var(--warn);opacity:.45" }), "Dibatalkan"), el("span", {}, el("i", { style: "background:var(--bad)" }), "Gagal"))) : null,
        el("div", { class: "tw" }, el("p", { class: "sub" }, "Proses terakhir"), tabel)),
    ];
  });
  const r0 = d.repo[0];
  return bagian("A", "GitHub", d.repo.map((r) => r.nama).join(", "),
    [["Repositori", r0.url], ["Secrets", `${r0.url}/settings/secrets/actions`], ["Actions", `${r0.url}/actions`]],
    [d.tanpaToken ? el("p", { class: "note info" }, "Dibaca tanpa token (hanya repo publik, batas 60 permintaan per jam). Isi token GitHub proyek ini supaya stabil.") : null, ...isi]);
}

// ---------- B: Supabase ----------

const nadaSb = (s) => (s === "ACTIVE_HEALTHY" ? "ok" : s === "INACTIVE" || s === "PAUSED" ? "warn" : "bad");

function bagianSupabase(d) {
  if (d.status !== "ok") {
    return bagian("B", "Supabase", d.status === "tidak-dipakai" ? "tidak dipakai" : "belum tersambung", [["Supabase", "https://supabase.com/dashboard/projects"]],
      bukanOk(d, "Supabase", ["Undang akun induk ke organisasi Supabase proyek (Organization Settings → Team)", "Buat access token di akun induk", "Simpan sebagai secret proyek ini"]),
      d.status !== "gagal");
  }
  const aktif = d.proyek.filter((p) => p.status === "ACTIVE_HEALTHY").length;
  const jeda = d.proyek.filter((p) => p.status === "INACTIVE" || p.status === "PAUSED").length;
  const kartu = d.proyek.map((p) => {
    const sehat = p.status === "ACTIVE_HEALTHY";
    return el("div", { class: "card" + (sehat ? "" : " warn") },
      el("div", { class: "t" }, el("span", { class: "dot " + nadaSb(p.status) }), el("b", {}, p.nama), pill(p.status, nadaSb(p.status))),
      el("dl", { class: "kv" }, el("dt", {}, "Region"), el("dd", {}, p.region), el("dt", {}, "Ref"), el("dd", { class: "mono" }, p.ref),
        el("dt", {}, "Postgres"), el("dd", { class: "mono" }, p.postgres || "–"), el("dt", {}, "Dibuat"), el("dd", {}, tgl(p.dibuat))),
      el("div", { class: "row" },
        sehat
          ? [link("Tabel", `${p.url}/editor`, "btn"), link("SQL", `${p.url}/sql/new`, "btn"), link("Logs", `${p.url}/logs/explorer`, "btn")]
          : [Object.assign(link("Aktifkan lagi di Supabase", p.url, "btn pri"), { style: "background:var(--sb)" }), link("Detail", p.url, "btn")]));
  });
  return bagian("B", "Supabase", `${d.proyek.length} proyek`, [["Dashboard", "https://supabase.com/dashboard/projects"]], [
    el("div", { class: "stats" }, stat(d.proyek.length, "Proyek"), stat(aktif, "Aktif & sehat", "ok"), stat(jeda, "Dijeda", jeda ? "warn" : "")),
    el("div", { class: "cards" }, kartu),
  ]);
}

// ---------- C: Cloudflare ----------

const nadaPages = (s) => (s === "success" ? "ok" : s === "failure" ? "bad" : "warn");

function bagianCloudflare(d) {
  if (d.status !== "ok") {
    return bagian("C", "Cloudflare", d.status === "tidak-dipakai" ? "tidak dipakai" : "belum tersambung", [["Cloudflare", "https://dash.cloudflare.com"]],
      d.status === "tidak-dipakai"
        ? kosong("Proyek ini belum memakai Cloudflare Pages atau D1", "Bucket R2 milik proyek ini, kalau ada, tampil di bagian Penyimpanan. Tambahkan proyek Pages atau database D1 di pengaturan proyek supaya bagian ini terisi.")
        : bukanOk(d, "Cloudflare", ["Undang akun induk sebagai member akun Cloudflare proyek", "Buat API token baca (Pages, D1, R2) di akun induk", "Simpan ID akun dan token sebagai secret proyek ini"]),
      d.status !== "gagal");
  }
  const kosongD1 = d.d1.filter((x) => x.tabel === 0).length;
  return bagian("C", "Cloudflare", "Pages · D1", [["Workers & Pages", d.dasbor]], [
    el("div", { class: "stats" }, stat(d.pages.length, "Proyek Pages"), stat(d.d1.length, "Database D1"), stat(kosongD1, "D1 tanpa tabel", kosongD1 ? "warn" : "")),
    d.pages.length ? el("div", { class: "tw" }, el("p", { class: "sub" }, "Pages"), el("table", { "aria-label": "Proyek Pages" },
      el("thead", {}, el("tr", {}, el("th", {}, "Proyek"), el("th", {}, "Branch"), el("th", {}, "Domain"), el("th", {}, "Deploy terakhir"), el("th", {}, "Status"))),
      el("tbody", {}, d.pages.map((p) => el("tr", {},
        el("td", {}, link(p.nama, p.url)), el("td", { class: "mono" }, p.cabang || "–"),
        el("td", {}, p.domain ? link(p.domain, `https://${p.domain}`) : "–"), el("td", {}, waktu(p.diperbarui)),
        el("td", {}, p.status ? pill(`${p.tahap || ""} ${p.status}`.trim(), nadaPages(p.status)) : "–")))))) : null,
    d.d1.length ? el("div", { class: "tw" }, el("p", { class: "sub" }, "Database D1"), el("table", { "aria-label": "Database D1" },
      el("thead", {}, el("tr", {}, el("th", {}, "Nama"), el("th", {}, "Tabel"), el("th", {}, "Ukuran"), el("th", {}, "Dibuat"))),
      el("tbody", {}, d.d1.map((x) => el("tr", {},
        el("td", {}, link(x.nama, x.url)), el("td", { class: x.tabel === 0 ? "n warn" : "" }, x.tabel === 0 ? "0 (kosong)" : angka(x.tabel)),
        el("td", {}, ukuran(x.ukuran)), el("td", {}, tgl(x.dibuat))))))) : null,
    kosongD1 ? el("p", { class: "note" }, "Ada database D1 tanpa tabel. Skema belum diterapkan, jadi fitur yang menyimpan data ke database ini belum berjalan.") : null,
  ]);
}

// ---------- D: Penyimpanan ----------

const nadaTautan = (s) => (s === "dipakai" ? "ok" : "mut");

function bagianPenyimpanan(d) {
  const r2 = d.r2;
  const kartu = [];
  if (r2.status === "ok") {
    for (const b of r2.bucket) {
      kartu.push(el("div", { class: "card" },
        el("div", { class: "t" }, el("span", { class: "dot", style: "background:var(--cf)" }), el("b", {}, "Cloudflare R2"), pill("dipakai", "ok")),
        el("div", { class: "mono" }, link(b.nama, b.url)),
        el("div", { class: "muted" }, `Dibuat ${tgl(b.dibuat)}`)));
    }
  } else if (r2.status !== "tidak-dipakai") {
    kartu.push(el("div", { class: "card" },
      el("div", { class: "t" }, el("span", { class: "dot" }), el("b", {}, "Cloudflare R2"), pill(r2.status === "gagal" ? "gagal dimuat" : "menunggu akses", r2.status === "gagal" ? "bad" : "mut")),
      el("div", { class: "muted" }, r2.pesan || "")));
  }
  for (const t of d.tautan) {
    kartu.push(el("div", { class: "card" },
      el("div", { class: "t" }, el("span", { class: "dot", style: "background:var(--st)" }), el("b", {}, t.nama), t.status ? pill(t.status, nadaTautan(t.status)) : null),
      t.akun ? el("div", { class: "mono" }, t.akun) : null,
      el("div", { class: "muted" }, t.catatan || ""),
      el("div", { class: "row" }, link(`Buka ${t.nama}`, t.url, "btn"))));
  }
  if (!kartu.length) {
    return bagian("D", "Penyimpanan", "tidak ada", [["R2", "https://dash.cloudflare.com"]],
      kosong("Belum ada penyimpanan", "Tambahkan bucket R2 atau tautan cloud lain di pengaturan proyek."), true);
  }
  return bagian("D", "Penyimpanan", [r2.status === "ok" && r2.bucket.length ? "R2" : null, ...d.tautan.map((t) => t.nama)].filter(Boolean).join(" · "),
    d.tautan.slice(0, 2).map((t) => [t.nama, t.url]),
    [el("div", { class: "cards" }, kartu),
      d.tautan.some((t) => /mega|synology/i.test(t.nama)) ? el("p", { class: "note info" }, "MEGA dan Synology ditampilkan sebagai tautan. Kuota dan jumlah file bisa ditambahkan nanti lewat Worker penghubung.") : null]);
}

// ---------- Strip ringkasan + perhatian ----------

function chip(nama, d) {
  if (d.status === "tidak-dipakai") return el("span", { class: "chip wait" }, `${nama} · tidak dipakai`);
  if (d.status === "menunggu-akses") return el("span", { class: "chip wait" }, `${nama} · menunggu akses`);
  if (d.status === "gagal") return el("span", { class: "chip warn" }, el("span", { class: "dot bad" }), `${nama} · gagal dimuat`);
  return el("span", { class: "chip" }, el("span", { class: "dot ok" }), `${nama} · tersambung`);
}

function render(d) {
  const perlu = d.perhatian || [];
  $("#isi").replaceChildren(
    el("div", { style: "display:grid;gap:12px" },
      el("section", { class: "strip", "aria-label": "Ringkasan proyek" },
        el("h2", {}, d.nama), el("p", {}, d.deskripsi),
        el("div", { class: "chips" }, chip("GitHub", d.github), chip("Supabase", d.supabase), chip("Cloudflare", d.cloudflare), chip("Penyimpanan", d.penyimpanan))),
      perlu.length
        ? el("section", { "aria-label": "Perlu dicek" }, el("ul", { class: "perhatian" }, perlu.map((x) => el("li", {}, el("span", { class: "dot " + (x.tingkat === "gagal" ? "bad" : "warn") }), el("b", {}, x.bagian), x.pesan))))
        : el("p", { class: "muted", style: "margin:0" }, "Tidak ada yang perlu ditindaklanjuti di proyek ini.")),
    el("div", { class: "grid", style: "margin-top:16px" }, bagianGithub(d.github), bagianSupabase(d.supabase), bagianCloudflare(d.cloudflare), bagianPenyimpanan(d.penyimpanan)),
    el("section", { class: "p aplikasi", id: "bagian-aplikasi", "aria-labelledby": "bagian-aplikasi-j", style: "margin-top:16px" },
      el("div", { class: "ph" },
        el("div", { class: "letter", style: "background:var(--ink)", "aria-hidden": "true" }, "E"),
        el("h3", { id: "bagian-aplikasi-j" }, "Aplikasi"),
        el("span", { class: "acct" }, "file privat · hanya akun Anda"),
        el("div", { class: "btns" },
          el("label", { class: "btn pri", style: "background:var(--ink)", for: "pilih-file" }, "Unggah file"),
          el("input", { type: "file", id: "pilih-file", hidden: true, accept: ".apk,.aab,.zip,.exe,.msi,.dmg,.ipa,.pdf" }))),
      el("div", { class: "pb", id: "isi-aplikasi" }, el("p", { class: "muted", style: "margin:0" }, "Memuat daftar file…"))),
  );
  muatAplikasi(d.id);
  $("#pilih-file").addEventListener("change", (e) => unggah(d.id, e.target.files[0]));
  $("#waktu-ambil").textContent = `Data per ${waktu(d.diambil)} WIB`;
  document.title = `${d.nama} · Pusat Kendali`;
}

// ---------- E: Aplikasi (file privat di R2) ----------

const namaAman = (n) => n.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(0, 120);
let konfirmasiHapus = null; // nama file yang menunggu konfirmasi

async function muatAplikasi(id) {
  const kotak = $("#isi-aplikasi");
  if (!kotak) return;
  let d;
  try {
    d = await ambil(`/api/unduhan/${encodeURIComponent(id)}`);
  } catch (e) {
    kotak.replaceChildren(el("p", { class: "note" }, `Daftar file gagal dimuat: ${e.message}`));
    return;
  }
  if (proyekAktif() !== id) return;
  if (d.status === "belum-diatur") {
    kotak.replaceChildren(kosong("Penyimpanan aplikasi belum diatur", "Buat bucket R2 pusat-kendali-unduhan dan hubungkan sebagai binding UNDUHAN di proyek Pages ini."));
    return;
  }
  if (!d.file.length) {
    kotak.replaceChildren(kosong("Belum ada file aplikasi", "Klik Unggah file untuk menyimpan APK atau installer proyek ini. File hanya bisa diunduh setelah login."));
    return;
  }
  const url = (n) => `/api/unduhan/${encodeURIComponent(id)}/${encodeURIComponent(n)}`;
  kotak.replaceChildren(el("div", { class: "tw" }, el("table", { "aria-label": "File aplikasi" },
    el("thead", {}, el("tr", {}, el("th", {}, "File"), el("th", {}, "Ukuran"), el("th", {}, "Diunggah"), el("th", {}, "Oleh"), el("th", {}, ""))),
    el("tbody", {}, d.file.map((f) => el("tr", {},
      el("td", { class: "mono" }, f.nama), el("td", {}, ukuran(f.ukuran)), el("td", {}, waktu(f.diunggah)), el("td", { class: "muted" }, f.oleh || "–"),
      el("td", {}, el("div", { class: "row" },
        el("a", { class: "btn", href: url(f.nama), download: f.nama }, "Unduh"),
        konfirmasiHapus === f.nama
          ? [el("button", { class: "btn hapus-ya", type: "button", "data-nama": f.nama }, `Ya, hapus ${f.nama}`), el("button", { class: "btn hapus-batal", type: "button" }, "Batal")]
          : el("button", { class: "btn hapus", type: "button", "data-nama": f.nama }, "Hapus")))))))));
  kotak.onclick = async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.classList.contains("hapus")) { konfirmasiHapus = t.dataset.nama; muatAplikasi(id); }
    else if (t.classList.contains("hapus-batal")) { konfirmasiHapus = null; muatAplikasi(id); }
    else if (t.classList.contains("hapus-ya")) {
      t.disabled = true;
      const res = await fetch(url(t.dataset.nama), { method: "DELETE" });
      konfirmasiHapus = null;
      if (!res.ok) kotak.prepend(el("p", { class: "note" }, `Gagal menghapus: ${(await res.json().catch(() => ({}))).error || res.status}`));
      else muatAplikasi(id);
    }
  };
}

async function unggah(id, file) {
  if (!file) return;
  const kotak = $("#isi-aplikasi");
  const nama = namaAman(file.name);
  kotak.prepend(el("p", { class: "note info", id: "status-unggah" }, `Mengunggah ${nama} (${ukuran(file.size)})…`));
  const res = await fetch(`/api/unduhan/${encodeURIComponent(id)}/${encodeURIComponent(nama)}`, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
  const info = await res.json().catch(() => ({}));
  $("#pilih-file").value = "";
  if (!res.ok) {
    $("#status-unggah").textContent = `Gagal mengunggah ${nama}: ${info.error || res.status}`;
    $("#status-unggah").className = "note";
    return;
  }
  muatAplikasi(id);
}

// ---------- Pemilih proyek & pemuatan ----------

let daftar = [];
let ringkasan = {}; // id -> {teks, nada} untuk titik dan keterangan di tab

// Keterangan tab: jumlah yang perlu dicek, atau "menunggu akses" bila belum ada bagian yang tersambung.
function statusTab(d) {
  const n = d.perhatian.length;
  if (n) return { teks: `${n} perlu dicek`, nada: "warn" };
  const tersambung = ["github", "supabase", "cloudflare"].some((k) => d[k].status === "ok") || d.penyimpanan.r2.status === "ok";
  return tersambung ? { teks: "aman", nada: "ok" } : { teks: "menunggu akses", nada: "" };
}

function proyekAktif() {
  const id = location.hash.slice(1);
  return daftar.find((p) => p.id === id) ? id : daftar[0]?.id;
}

function gambarTab() {
  const aktif = proyekAktif();
  $("#pilih-proyek").replaceChildren(...daftar.map((p) => {
    const st = ringkasan[p.id] || { teks: "belum dimuat", nada: "" };
    return el("a", { class: "sw", href: `#${p.id}`, "aria-current": p.id === aktif ? "page" : null },
      el("span", { class: "dot " + st.nada }),
      el("span", {}, el("b", {}, p.nama), el("small", {}, st.teks)));
  }));
}

async function ambil(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function muatProyek(segar = false) {
  const id = proyekAktif();
  if (!id) return;
  gambarTab();
  $("#isi").setAttribute("aria-busy", "true");
  try {
    const d = await ambil(`/api/proyek/${encodeURIComponent(id)}${segar ? "?segar=1" : ""}`);
    if (proyekAktif() !== id) return;
    ringkasan[id] = statusTab(d);
    render(d);
    gambarTab();
  } catch (e) {
    $("#isi").replaceChildren(el("p", { class: "galat" }, `Gagal memuat proyek: ${e.message}`));
  } finally {
    $("#isi").removeAttribute("aria-busy");
  }
}

async function mulai() {
  try {
    const d = await ambil("/api/proyek");
    daftar = d.proyek;
    if (d.email) {
      $("#pengguna").textContent = d.email;
      $("#pengguna").title = `Masuk sebagai ${d.email}`;
      $("#pengguna").hidden = false;
    }
    await muatProyek();
    // Ringkasan proyek lain dimuat di latar, supaya titik status di setiap tab terisi.
    for (const p of daftar.filter((x) => x.id !== proyekAktif())) {
      ambil(`/api/proyek/${encodeURIComponent(p.id)}`).then((d) => { ringkasan[p.id] = statusTab(d); gambarTab(); }).catch(() => {});
    }
  } catch (e) {
    $("#isi").replaceChildren(el("p", { class: "galat" }, `Gagal memuat: ${e.message}`));
  }
}

window.addEventListener("hashchange", () => muatProyek());
$("#muat-ulang").addEventListener("click", () => muatProyek(true));
mulai();
