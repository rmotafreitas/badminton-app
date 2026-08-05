import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

interface PWAContextType {
  canInstall: boolean;
  isInstalled: boolean;
  installApp: () => void;
  updateAvailable: boolean;
  applyUpdate: () => void;
}

export const PWAContext = createContext<PWAContextType | null>(null);

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] =
    useState<ServiceWorker | null>(null);

  const canInstall = !!deferredPrompt && !isInstalled;

  useEffect(() => {
    setIsInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        Boolean(navigator.standalone),
    );
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    const handler = () => setIsInstalled(true);
    window.addEventListener("appinstalled", handler);
    return () => window.removeEventListener("appinstalled", handler);
  }, []);

  const installApp = useCallback(() => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      setDeferredPrompt(null);
    });
  }, [deferredPrompt]);

  const applyUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    }
    setUpdateAvailable(false);
    window.location.reload();
  }, [waitingWorker]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setUpdateAvailable(true);
        return;
      }

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            setWaitingWorker(installing);
            setUpdateAvailable(true);
          }
        });
      });
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }, []);

  const value = useMemo(
    () => ({
      canInstall,
      isInstalled,
      installApp,
      updateAvailable,
      applyUpdate,
    }),
    [canInstall, isInstalled, installApp, updateAvailable, applyUpdate],
  );

  return <PWAContext.Provider value={value}>{children}</PWAContext.Provider>;
}
