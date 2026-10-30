import { PROYEK } from "../../_lib/proyek.js";

export function onRequestGet({ data }) {
  return Response.json(
    { email: data.email, proyek: PROYEK.map(({ id, nama, deskripsi }) => ({ id, nama, deskripsi })) },
    { headers: { "cache-control": "no-store" } },
  );
}
