import { useEffect, useState } from "react";
import { usePWA } from "@/hooks/usePWA";
import { useAuth } from "@/hooks/useAuth";
import { useDictionary } from "@/i18n";

const A2HS_KEY = "badminton-a2hs-dismissed";

export function AddToHomeScreenTip() {
  const { isInstalled, canInstall } = usePWA();
  const { isAuthenticated } = useAuth();
  const dict = useDictionary().pwa;
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(A2HS_KEY) === "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!isAuthenticated || dismissed || isInstalled || !canInstall) return;
    const id = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(id);
  }, [isAuthenticated, dismissed, isInstalled, canInstall]);

  if (!visible) return null;

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
    try {
      localStorage.setItem(A2HS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] p-3 bg-white border-t shadow-lg animate-in slide-in-from-bottom">
      <div className="flex items-center gap-3 max-w-lg mx-auto">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[hsl(var(--primary))] flex items-center justify-center text-white text-lg">
          🏸
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {dict.addToHomeScreen}
          </p>
          <p className="text-xs text-muted-foreground">
            {dict.addToHomeScreenDesc}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-sm text-muted-foreground hover:text-foreground px-2 py-1"
        >
          {dict.dismiss}
        </button>
      </div>
    </div>
  );
}
