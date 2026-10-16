// Link Kedai App helper: opens fast and shows a friendly page when offline.
// Pages, the manifest and the icons are always fetched fresh first, so updates arrive straight away.
const V = "linkedai-v44";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png", "./favicon.png", "./sc-status.png", "./sc-store.png", "./sc-browse.png", "./sc-affiliate.png", "./badge-96.png"];
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

// Notifications from the Link Kedai App server. Tapping one opens the page it's about (store home, News or Insights).
self.addEventListener("push", e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (x) { m = { body: e.data ? e.data.text() : "" }; }
  const scope = self.registration.scope;
  let url = scope; try { const u = new URL(m.url || "./?build", scope); if (u.href.startsWith(scope)) url = u.href; } catch (x) {}
  e.waitUntil(self.registration.showNotification(String(m.title || "Link Kedai App").slice(0, 100), {
    body: String(m.body || "").slice(0, 300), icon: scope + "icon-192.png", badge: scope + "badge-96.png",
    tag: m.tag ? String(m.tag) : undefined, renotify: !!m.tag, data: { url }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const w = list.find(c => c.url.startsWith(self.registration.scope));
    if (w && "navigate" in w) return w.navigate(url).then(c => (c || w).focus()).catch(() => self.clients.openWindow(url));
    return self.clients.openWindow(url);
  }));
});
