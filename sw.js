/* krua-baan service worker: เปิดครั้งแรกโหลดครบ ครั้งต่อไปเปิดได้แม้เน็ตหลุด */
const VER = "krua-v1";
const CORE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-180.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches
      .open(VER)
      .then(c => c.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches
      .keys()
      .then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(r => {
          const cp = r.clone();
          caches
            .open(VER)
            .then(c => c.put("./", cp))
            .catch(() => {});
          return r;
        })
        .catch(() =>
          caches.match("index.html").then(r => r || caches.match("./"))
        )
    );
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(
        hit =>
          hit ||
          fetch(req).then(r => {
            const cp = r.clone();
            caches
              .open(VER)
              .then(c => c.put(req, cp))
              .catch(() => {});
            return r;
          })
      )
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req)
        .then(r => {
          if (r && (r.ok || r.type === "opaque")) {
            const cp = r.clone();
            caches
              .open(VER)
              .then(c => c.put(req, cp))
              .catch(() => {});
          }
          return r;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
