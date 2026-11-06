import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRallyRepo } from "@/di/container";
import { getSessionManager, type LocalSession, type SessionManager } from "../sessions/manager";

export function useSessionManager(): SessionManager {
  return getSessionManager(useRallyRepo());
}

export function useLocalSessions(): LocalSession[] {
  const m = useSessionManager();
  return useSyncExternalStore(
    (fn) => m.subscribe(fn),
    () => m.snapshot(),
    () => m.snapshot(),
  );
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Object URL for a blob, revoked on change/unmount. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

export { formatBytes, formatDuration } from "./format";
