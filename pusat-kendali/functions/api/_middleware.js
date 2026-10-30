import { periksaAkses } from "../_lib/akses.js";

export async function onRequest(context) {
  const akses = await periksaAkses(context.request, context.env);
  if (!akses.ok) {
    return Response.json({ error: akses.pesan }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  context.data.email = akses.email;
  return context.next();
}
