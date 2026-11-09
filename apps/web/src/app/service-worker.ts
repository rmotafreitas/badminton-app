import { toast } from "sonner";

/**
 * Registers the service worker. A new version waits until the user chooses to reload (never under them while they
 * are recording a rally or typing a score).
 */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const offer = (worker: ServiceWorker) =>
        toast("A new version is ready", {
          duration: Number.POSITIVE_INFINITY,
          action: {
            label: "Reload",
            onClick: () => {
              navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
              worker.postMessage({ type: "SKIP_WAITING" });
            },
          },
        });
      if (registration.waiting && navigator.serviceWorker.controller) offer(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) offer(worker);
        });
      });
      // Check for a new deploy whenever the app comes back to the foreground.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void registration.update().catch(() => undefined);
      });
    } catch {
      // No service worker: the app still works online.
    }
  });
}
