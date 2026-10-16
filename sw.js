// Link Kedai App helper: opens fast and shows a friendly page when offline.
// Pages, the manifest and the icons are always fetched fresh first, so updates arrive straight away.
const V = "linkedai-v43";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png", "./favicon.png", "./sc-status.png", "./sc-store.png", "./sc-browse.png", "./sc-affiliate.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => fetch(u, { cache: "reload" }).then(r => r.ok && c.put(u, r)).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;           // Google script, map tiles, photos: always live
  if (req.mode === "navigate") {
    // Only the app itself refreshes the offline copy: a store's share page (a tiny redirect) or a server error must never replace it
    const root = new URL("./", self.registration.scope).pathname;
    const isApp = url.pathname === root || url.pathname === root + "index.html";
    e.respondWith(fetch(req).then(r => { if (isApp && r.ok && !r.redirected){ const copy = r.clone(); caches.open(V).then(c => c.put("./index.html", copy)).catch(() => {}); } return r; })
      .catch(() => caches.match("./index.html")));
    return;
  }
  if (/\.(png|webmanifest|json)$/.test(url.pathname)) {
    // network first so a changed name or icon shows up right away; cache only when offline
    // stored without the ?t= cache-buster, so there is one copy per file instead of a new one on every visit
    const key = url.origin + url.pathname;
    e.respondWith(fetch(req).then(r => { if (r.ok){ const copy = r.clone(); caches.open(V).then(c => c.put(key, copy)).catch(() => {}); } return r; })
      .catch(() => caches.match(key)));
  }
});
