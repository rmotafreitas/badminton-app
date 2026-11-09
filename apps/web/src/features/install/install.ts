import { useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Chromium (Android Chrome, Samsung Internet, desktop Chrome/Edge) fires `beforeinstallprompt` once the app is
 * installable — possibly before React mounts, so it is captured at module load (main.tsx imports this first).
 * Safari and Firefox never fire it: iOS installs only from the Share menu, so we show how instead.
 */
let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // our own card decides when to ask
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    emit();
  });
}

export type InstallPlatform = "ios" | "android" | "desktop";

export function installPlatform(ua = navigator.userAgent): InstallPlatform {
  // iPadOS reports a Mac user agent; touch support gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export const isStandalone = (): boolean =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", fn);
  return () => {
    listeners.delete(fn);
    media.removeEventListener("change", fn);
  };
};

const snapshot = () => `${!!deferred}|${installedNow}|${isStandalone()}`;

export interface InstallState {
  /** Running as the installed app (or installed during this visit). */
  readonly installed: boolean;
  /** The browser can show its own install dialog right now. */
  readonly canPrompt: boolean;
  readonly platform: InstallPlatform;
  /** Shows the browser's dialog. "unavailable" when there is none (iOS, Firefox): show the guide instead. */
  prompt(): Promise<"accepted" | "dismissed" | "unavailable">;
}

export function useInstall(): InstallState {
  const key = useSyncExternalStore(subscribe, snapshot, () => "false|false|false");
  const [hasPrompt, justInstalled, standalone] = key.split("|").map((v) => v === "true");
  return {
    installed: !!(justInstalled || standalone),
    canPrompt: !!hasPrompt,
    platform: installPlatform(),
    async prompt() {
      if (!deferred) return "unavailable";
      const event = deferred;
      deferred = null;
      emit();
      await event.prompt();
      return (await event.userChoice).outcome;
    },
  };
}

const DISMISS_KEY = "bb:install-dismissed-at";
const SNOOZE_MS = 21 * 86_400_000;

export const installSnoozed = (): boolean => {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < SNOOZE_MS;
  } catch {
    return false;
  }
};

export const snoozeInstall = () => {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
};
