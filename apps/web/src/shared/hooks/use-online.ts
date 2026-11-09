import { useSyncExternalStore } from "react";

const subscribe = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};

/** The browser's connectivity, live. */
export const useOnline = (): boolean => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
