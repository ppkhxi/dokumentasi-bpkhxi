// Penyimpanan file aplikasi (APK dan sejenisnya) per proyek di bucket R2 privat.
// Binding R2: UNDUHAN. Kunci objek: "<id proyek>/<nama file>".

import { cariProyek } from "./proyek.js";

export const EKSTENSI = ["apk", "aab", "zip", "exe", "msi", "dmg", "ipa", "pdf"];
export const MAKS_BYTE = 95 * 1024 * 1024; // batas body permintaan Workers 100 MB

export function bucket(env) {
  return env.UNDUHAN || null;
}

export function periksaProyek(id) {
  return cariProyek(id) ? null : Response.json({ error: "Proyek tidak ditemukan." }, { status: 404 });
}

// Nama file: huruf, angka, titik, minus, garis bawah; tanpa folder; ekstensi terdaftar.
export function namaSah(nama) {
  if (!nama || nama.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(nama)) return false;
  const ext = nama.split(".").pop().toLowerCase();
  return EKSTENSI.includes(ext);
}

// Tolak perubahan yang tidak berasal dari halaman ini sendiri.
export function dariHalamanSendiri(request) {
  const situs = request.headers.get("sec-fetch-site");
  return !situs || situs === "same-origin";
}

export const galat = (pesan, status = 400) => Response.json({ error: pesan }, { status, headers: { "cache-control": "no-store" } });
