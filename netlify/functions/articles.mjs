/*
  Δίνει τα δημοσιευμένα άρθρα (Netlify Blobs) στο index.html και στο admin.html.
  GET /api/articles -> το JSON, ή 404 όταν δεν έχει δημοσιευθεί τίποτα ακόμη
  (τότε και τα δύο διαβάζουν το articles.json του repo).
*/
import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const store = getStore("being-present-content");
    const text = await store.get("articles.json");
    if (!text) return new Response("", { status: 404, headers: { "cache-control": "no-store" } });
    return new Response(text, {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch {
    return new Response("", { status: 404, headers: { "cache-control": "no-store" } });
  }
};

export const config = { path: "/api/articles" };
