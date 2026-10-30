// Service worker: deixa o app abrir sem internet. Arquivos do app ficam em cache;
// imagens já vistas também (até 400), para o feed não ficar em branco offline.
const APP = "mirante-app-v1", IMG = "mirante-img-v1";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(APP).then(c => c.addAll(["./", "./index.html", "./manifest.webmanifest", "./icon.svg"]))); });
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== APP && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.includes("/rest/v1/") || url.pathname.includes("/auth/v1/") || url.pathname.includes("/realtime/")) return;  // dados vão direto
  if (req.destination === "image") {
    e.respondWith(caches.open(IMG).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") { c.put(req, res.clone()); trim(c); }
      return res;
    }).catch(() => fetch(req)));
    return;
  }
  if (url.origin === location.origin) {
    // app: rede primeiro (pega versão nova), cache se estiver sem internet
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(APP).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match("./index.html"))));
  }
});
async function trim(c) { const ks = await c.keys(); for (const k of ks.slice(0, Math.max(0, ks.length - 400))) await c.delete(k); }
