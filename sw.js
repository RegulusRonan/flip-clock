// Offline support for Flip Clock.
//
// - On first visit, saves a copy of every file the app needs.
// - Every open after that is served from those copies: instant, and works
//   with no internet.
// - Each time a file is used while online, a fresh copy is fetched in the
//   background. If it changed (a new version was pushed), the saved copy is
//   replaced and the page is told, so it can reload into the new version.

const CACHE = "flip-clock";

const FILES = [
  "/",
  "/style.css",
  "/script.js",
  "/manifest.webmanifest",
  "/fonts/barlow-condensed-600-latin.woff2",
  "/icons/favicon.svg",
  "/icons/favicon-32.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page and /index.html are the same file; store it once under "/"
function cacheKey(request) {
  const url = new URL(request.url);
  if (request.mode === "navigate" || url.pathname === "/index.html") return "/";
  return url.pathname;
}

function sameBytes(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a), y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

async function refresh(key, clientId) {
  try {
    const fresh = await fetch(key, { cache: "no-store" });
    if (!fresh.ok) return;
    const cache = await caches.open(CACHE);
    const old = await cache.match(key);
    let changed = false;
    if (old) {
      const [a, b] = await Promise.all([old.arrayBuffer(), fresh.clone().arrayBuffer()]);
      changed = !sameBytes(a, b);
    }
    await cache.put(key, fresh);
    if (changed) {
      // Tell every open page, including the one still loading that asked
      // for this file (it isn't always listed by matchAll yet)
      const pages = await self.clients.matchAll({ type: "window" });
      const asking = clientId && (await self.clients.get(clientId));
      if (asking && !pages.some((p) => p.id === asking.id)) pages.push(asking);
      pages.forEach((page) => page.postMessage({ type: "updated" }));
    }
  } catch {
    // Offline: keep using the saved copy
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const key = cacheKey(request);

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const saved = await cache.match(key);
      const update = refresh(key, event.resultingClientId || event.clientId);
      event.waitUntil(update);
      if (saved) return saved;
      await update; // not saved yet: wait for the network copy
      return (await cache.match(key)) || fetch(request);
    })
  );
});
