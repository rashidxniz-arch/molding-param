// App shell cached; data files network-first; the Google script is never cached.
const CACHE = "mpa-v2";
const SHELL = ["./", "index.html", "app.js", "app.css", "config.js", "manifest.webmanifest", "brand/npi-logo-compact.png", "brand/npi-logo-full.png", "brand/npi-icon.png", "icons/icon-192.png", "icons/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && !url.pathname.includes("/data/")) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request.url.split("?")[0], copy)); }
      return r;
    }).catch(() => caches.match(e.request.url.split("?")[0]).then(r => r || caches.match("index.html")))
  );
});
