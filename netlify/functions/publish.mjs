/*
  Being Present — δημοσίευση άρθρων από το admin.html (Netlify Function).
  Ο κωδικός και το κλειδί GitHub μένουν στον server, ποτέ στον browser.

  POST /api/publish   { pass, action:"login" }                  -> { ok:true }
  POST /api/publish   { pass, action:"publish", articles:[…] }  -> { ok:true, where, when }
  GET  /api/publish                                             -> { ok:true, blobs, github }

  Τα δημοσιευμένα άρθρα ζουν στο Netlify Blobs (αμέσως online, χωρίς rebuild). Το articles.json
  του repo είναι το αντίγραφο ασφαλείας / η πρώτη έκδοση. Αν υπάρχει GITHUB_TOKEN στις μεταβλητές
  του site, το ίδιο αρχείο γράφεται και στο repo ώστε τα δύο να μην ξεφεύγουν ποτέ.

  Κωδικός: συγκρίνεται με το ADMIN_PASS_SHA256 πιο κάτω (sha-256 του κωδικού).
  Για αλλαγή κωδικού: βάλε τη μεταβλητή ADMIN_PASS στο Netlify — αυτή υπερισχύει.
*/
import { getStore } from "@netlify/blobs";

/* sha-256 του «beingpresent2026» */
const ADMIN_PASS_SHA256 = "29343b301aeb687a99bc72d3b140fac9f841391f6beee210a132c3fcd626f287";
const STORE = "being-present-content";
const KEY = "articles.json";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function checkPass(pass) {
  if (typeof pass !== "string" || !pass) return false;
  const env = process.env.ADMIN_PASS;
  if (env) return pass === env;
  return (await sha256(pass)) === ADMIN_PASS_SHA256;
}

/* keep only the fields the site reads, so nothing unexpected can be stored */
function clean(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 300).map((a) => ({
    id: String(a.id || "").slice(0, 40) || Math.random().toString(36).slice(2, 10),
    slug: String(a.slug || "").slice(0, 120),
    title: String(a.title || "").slice(0, 300),
    date: /^\d{4}-\d{2}-\d{2}$/.test(a.date || "") ? a.date : "",
    summary: String(a.summary || "").slice(0, 1000),
    body: String(a.body || "").slice(0, 60000),
    draft: !!a.draft,
  }));
}

async function commitToGitHub(text) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const repo = process.env.GITHUB_REPO || "agelmet/GOUVIWTOU";
  const branch = process.env.GITHUB_BRANCH || "main";
  const api = `https://api.github.com/repos/${repo}/contents/articles.json`;
  const head = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "being-present-admin",
  };
  let sha = null;
  const cur = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers: head });
  if (cur.ok) sha = (await cur.json()).sha;
  else if (cur.status !== 404) throw new Error("GitHub " + cur.status);
  const body = {
    message: "Ενημέρωση άρθρων από τον πίνακα διαχείρισης",
    content: Buffer.from(text, "utf8").toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;
  const put = await fetch(api, { method: "PUT", headers: head, body: JSON.stringify(body) });
  if (!put.ok) throw new Error("GitHub " + put.status);
  return true;
}

export default async (req) => {
  if (req.method === "GET") {
    return json({ ok: true, blobs: true, github: !!process.env.GITHUB_TOKEN });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }

  if (!(await checkPass(body.pass))) return json({ ok: false, error: "pass" }, 401);
  if (body.action === "login") return json({ ok: true });
  if (body.action !== "publish") return json({ ok: false, error: "action" }, 400);

  const articles = clean(body.articles);
  const text = JSON.stringify(articles, null, 2);

  let where = "blobs";
  try {
    const store = getStore(STORE);
    await store.set(KEY, text);
  } catch (e) {
    return json({ ok: false, error: "blobs: " + (e && e.message) }, 500);
  }
  try {
    if (await commitToGitHub(text)) where = "blobs+github";
  } catch (e) {
    /* the live copy is already saved — the repo copy can catch up later */
    return json({ ok: true, where, when: Date.now(), warn: String(e && e.message) });
  }
  return json({ ok: true, where, when: Date.now() });
};

export const config = { path: "/api/publish" };
