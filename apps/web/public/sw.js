/*
 * Badminton Buddy service worker.
 * - /api is NEVER cached: user data lives in the persisted query cache (IndexedDB), revalidated by the app.
 * - Navigations are network-first (a deploy is picked up at once), but only for NAVIGATION_TIMEOUT_MS: on a weak
 *   connection (gym Wi-Fi, a basement court) the cached shell answers instead and the network copy updates the cache.
 * - Hashed build assets are cache-first (their URL changes with their content).
 * - Rally Analysis keeps its own caches (model weights) across updates.
 */
const CACHE = "badminton-buddy-v5";
const NAVIGATION_TIMEOUT_MS = 2500;
const SHELL = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];
const KEEP_PREFIX = "rally-";
const SKIP = ["/api/", "/models/", "/lab/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && !k.startsWith(KEEP_PREFIX)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.headers.has("range")) return;
  if (SKIP.some((p) => url.pathname.startsWith(p))) return;

  if (request.mode === "navigate") {
    let stored = Promise.resolve();
    const network = fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        stored = caches.open(CACHE).then((cache) => cache.put("/", copy));
      }
      return response;
    });
    // Keep the worker alive until the fresh shell is stored, even when the cached one answered first.
    event.waitUntil(network.then(() => stored).catch(() => undefined));
    event.respondWith(
      new Promise((resolve) => {
        let settled = false;
        const answer = (response) => {
          if (!settled && response) {
            settled = true;
            resolve(response);
          }
        };
        const fallback = () => caches.match("/").then(answer);
        const timer = setTimeout(fallback, NAVIGATION_TIMEOUT_MS);
        network
          .then((response) => {
            clearTimeout(timer);
            answer(response);
          })
          .catch(() => {
            clearTimeout(timer);
            caches.match("/").then((cached) => answer(cached || new Response("Offline", { status: 503 })));
          });
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
            return response;
          }),
      ),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
