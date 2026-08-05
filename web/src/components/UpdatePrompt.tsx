import { useEffect } from "react";
import { usePWA } from "@/hooks/usePWA";
import { useDictionary } from "@/i18n";

export function UpdatePrompt() {
  const { updateAvailable, applyUpdate } = usePWA();
  const dict = useDictionary().pwa;

  useEffect(() => {
    if (!updateAvailable) return;
  }, [updateAvailable]);

  if (!updateAvailable) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[70] p-3 bg-[hsl(var(--primary))] text-white">
      <div className="flex items-center gap-3 max-w-lg mx-auto">
        <p className="flex-1 text-sm">{dict.updateAvailable}</p>
        <button
          onClick={applyUpdate}
          className="flex-shrink-0 text-sm font-semibold bg-white/20 hover:bg-white/30 px-3 py-1 rounded"
        >
          {dict.updateNow}
        </button>
      </div>
    </div>
  );
}
