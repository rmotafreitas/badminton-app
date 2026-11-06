const CACHE_NAME = "badminton-buddy-v3";

const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// Never cache API responses — they must always go to the network
// (auth state, user data, etc. must be live).
const API_PREFIX = "/api/";

// Rally Analysis manages its own caches (model weights, ~45 MB): keep them
// across app updates and don't double-cache them here.
const KEEP_CACHE_PREFIX = "rally-";
const SKIP_PREFIXES = ["/models/", "/lab/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && !k.startsWith(KEEP_CACHE_PREFIX))
            .map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Never intercept API calls — always go to network.
  if (url.pathname.startsWith(API_PREFIX)) {
    return; // let the browser handle it normally
  }
  // Only same-origin app assets. Cross-origin (presigned video/analysis URLs
  // in object storage), range requests (video seeking) and large Rally
  // Analysis files go straight to the network.
  if (url.origin !== self.location.origin) return;
  if (event.request.headers.has("range")) return;
  if (SKIP_PREFIXES.some((p) => url.pathname.startsWith(p))) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached || new Response("Offline", { status: 503 }));

      return cached || fetchPromise;
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});