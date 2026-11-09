import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useOnline } from "@/shared/hooks/use-online";
import { useDictionary } from "@/shared/i18n";

/** Quick requests stay invisible; a slower one shows a thin bar; a much slower one says why (a sleeping API). */
const SHOW_BAR_MS = 400;
const SHOW_REASON_MS = 3_000;

/**
 * Global request feedback. Data already on screen keeps showing while it revalidates, so a stalled request is not
 * otherwise visible: without this, a cold-starting API looks like a frozen app. Offline has its own banner.
 */
export function NetworkActivity() {
  const busy = useIsFetching() + useIsMutating() > 0;
  const online = useOnline();
  const dict = useDictionary().ui;
  const [phase, setPhase] = useState<"idle" | "busy" | "slow">("idle");

  useEffect(() => {
    if (!busy) {
      setPhase("idle");
      return;
    }
    const bar = setTimeout(() => setPhase("busy"), SHOW_BAR_MS);
    const reason = setTimeout(() => setPhase("slow"), SHOW_REASON_MS);
    return () => {
      clearTimeout(bar);
      clearTimeout(reason);
    };
  }, [busy]);

  if (phase === "idle" || !online) return null;
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-safe z-[60] h-0.5 overflow-hidden bg-primary/15">
        <div className="animate-indeterminate h-full w-2/5 rounded-full bg-primary" />
      </div>
      {phase === "slow" && (
        <div
          role="status"
          className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.625rem)] z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur animate-in fade-in slide-in-from-top-2"
        >
          <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
          {dict.errors.waking}
        </div>
      )}
    </>
  );
}
