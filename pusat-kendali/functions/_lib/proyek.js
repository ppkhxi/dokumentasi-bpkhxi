// Daftar proyek dan sumber daya milik masing-masing.
// Nilai `token` dan `akun` adalah NAMA variabel/secret di Cloudflare Pages, bukan isinya.
// Bagian yang bernilai null dianggap "tidak dipakai" oleh proyek itu.

export const PROYEK = [
  {
    id: "looks",
    nama: "Looks Studios",
    deskripsi: "Studio foto & video · web order dan galeri klien",
    github: { token: "GITHUB_TOKEN_LOOKS", repo: [] }, // isi "pemilik/repo" setelah akun induk diundang
    supabase: {
      token: "SUPABASE_TOKEN_LOOKS",
      proyek: ["wiebbtetmpherducgutl", "hwxbcgweqvfrytmyqylq"],
    },
    cloudflare: {
      akun: "CF_ACCOUNT_LOOKS",
      token: "CF_TOKEN_LOOKS",
      pages: [],
      d1: [],
    },
    penyimpanan: {
      r2: ["looks-foto"],
      tautan: [
        { nama: "Google Drive", akun: "lookspicture.studios@gmail.com", url: "https://drive.google.com/drive/my-drive", catatan: "Folder kerja studio" },
      ],
    },
  },
  {
    id: "dkpoint",
    nama: "dkpoint",
    deskripsi: "Dokumentasi foto lapangan BPKH Wilayah XI · PWA + APK Android",
    github: { token: "GITHUB_TOKEN_DKPOINT", repo: ["ppkhxi/dokumentasi-bpkhxi"] },
    supabase: null,
    cloudflare: {
      akun: "CF_ACCOUNT_DKPOINT",
      token: "CF_TOKEN_DKPOINT",
      pages: ["dkpoint"],
      d1: ["dkpoint-admin"],
    },
    penyimpanan: {
      r2: [],
      tautan: [
        { nama: "MEGA", url: "https://mega.nz/fm", catatan: "Penyimpanan utama foto lapangan", status: "dipakai" },
        { nama: "Google Drive", url: "https://drive.google.com/drive/my-drive", catatan: "Pilihan login di aplikasi", status: "segera" },
        { nama: "Synology", url: "https://find.synology.com", catatan: "Pilihan login di aplikasi", status: "segera" },
      ],
    },
  },
  {
    id: "tnkps",
    nama: "Identifikasi TNKPS",
    deskripsi: "Identifikasi lapangan TNKPS",
    github: { token: "GITHUB_TOKEN_TNKPS", repo: [] },
    supabase: null,
    cloudflare: {
      akun: "CF_ACCOUNT_TNKPS",
      token: "CF_TOKEN_TNKPS",
      pages: [],
      d1: [],
    },
    penyimpanan: { r2: ["identifikasi-tnkps-foto"], tautan: [] },
  },
];

export const cariProyek = (id) => PROYEK.find((p) => p.id === id);
