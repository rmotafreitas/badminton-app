import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

/**
 * Calls `close` whenever the location changes, however that happened: a link, a menu item that navigates, the back
 * button. Sheets and drawers that offer navigation use it so they never stay open over the page they led to.
 */
export function useCloseOnNavigate(close: () => void) {
  const href = useRouterState({ select: (s) => s.location.href });
  const first = useRef(href);
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (href !== first.current) latest.current();
    first.current = href;
  }, [href]);
}
