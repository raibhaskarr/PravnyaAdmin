// Pravnya service worker: shows reminders (Web Push), opens the app when one is tapped, and keeps
// what the talking board needs so it works without a connection:
// - the app itself: pages network-first (always the newest when online), built files cache-first
//   (their names change with every build);
// - Mulberry symbol pictures: cache-first (they never change);
// - photos (/api/media/...): network-first, so the server still checks who's asking every time;
//   the copy is only used offline, on the device that was allowed to load it. Cleared on sign-out.
const SHELL = "pv-shell-v1";
const ASSETS = "pv-assets-v1";
const SYMBOLS = "pv-symbols-v1";
const MEDIA = "pv-media-v1";
const MAX_MEDIA = 400;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  const keep = [SHELL, ASSETS, SYMBOLS, MEDIA];
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("pv-") && !keep.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName, key) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) {
      await cache.put(key, res.clone());
      if (cacheName === MEDIA) {
        const keys = await cache.keys();
        for (const k of keys.slice(0, Math.max(0, keys.length - MAX_MEDIA))) await cache.delete(k);
      }
    }
    return res;
  } catch (e) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") await cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, SHELL, "/"));
  } else if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(req, ASSETS));
  } else if (url.hostname === "cdn.jsdelivr.net" && url.pathname.includes("/mulberry-symbols")) {
    event.respondWith(cacheFirst(req, SYMBOLS));
  } else if (url.pathname.startsWith("/api/media/")) {
    // The link changes every 15 minutes; the photo doesn't. Keyed without the link's query.
    event.respondWith(networkFirst(req, MEDIA, url.origin + url.pathname));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Pravnya", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Pravnya", {
      body: data.body || "",
      tag: data.tag,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { url: data.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        open.postMessage({ type: "open-url", url });
        return open.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
