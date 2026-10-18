// Link Kedai App helper: opens fast and shows a friendly page when offline.
// Pages, the manifest and the icons are always fetched fresh first, so updates arrive straight away.
const V = "linkedai-v69";
// Only what the app needs to open offline (the splash logo and loader logo included). Big icons and shortcut pictures
// are fetched when the phone asks for them, so a first visit doesn't download them all over a slow connection.
const SHELL = ["./index.html", "./manifest.webmanifest", "./icon-192.png", "./favicon.png", "./logo.png", "./logo-white.png", "./bot.jpg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => fetch(u, { cache: "reload" }).then(r => r.ok && c.put(u, r)).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// The newest page from the network, but never a long wait on a weak signal: after 1.5 seconds the saved copy opens instead
// (the network answer still arrives and is saved for next time).
const NAV_WAIT = 1500;
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;           // the server, map tiles, photos: always live
  if (req.mode === "navigate") {
    // Only the app itself refreshes the offline copy: a store's share page (a tiny redirect) or a server error must never replace it
    const root = new URL("./", self.registration.scope).pathname;
    const isApp = url.pathname === root || url.pathname === root + "index.html";
    const net = fetch(req).then(r => { if (isApp && r.ok && !r.redirected){ const copy = r.clone(); caches.open(V).then(c => c.put("./index.html", copy)).catch(() => {}); } return r; });
    e.respondWith(new Promise(resolve => {
      let done = false;
      const give = r => { if (!done && r){ done = true; resolve(r); } };
      // a store link (/shop-name) or the app itself: the saved app is a fine stand-in; the share pages aren't saved, so they always wait
      const canFallBack = isApp || !/\.[a-z0-9]+$/i.test(url.pathname) && !/\/$/.test(url.pathname.slice(root.length));
      const slow = canFallBack ? setTimeout(() => caches.match("./index.html").then(give), NAV_WAIT) : 0;
      net.then(r => { clearTimeout(slow); give(r); })
        .catch(() => { clearTimeout(slow); caches.match("./index.html").then(r => give(r || Response.error())); });
    }));
    e.waitUntil(net.catch(() => {}));
    return;
  }
  if (/\.(png|jpg|webp|webmanifest|json)$/.test(url.pathname)) {
    // network first so a changed name or icon shows up right away; cache only when offline
    // stored without the ?t= cache-buster, so there is one copy per file instead of a new one on every visit
    const key = url.origin + url.pathname;
    e.respondWith(fetch(req).then(r => { if (r.ok){ const copy = r.clone(); caches.open(V).then(c => c.put(key, copy)).catch(() => {}); } return r; })
      .catch(() => caches.match(key)));
  }
});
