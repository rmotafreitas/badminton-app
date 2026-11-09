// First: catches the browser's install prompt even if it fires before React mounts.
import "@/features/install";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterProvider, createAppRouter } from "@/app/router";
import { registerServiceWorker } from "@/app/service-worker";
import { LanguageProvider } from "@/shared/i18n";
import { ThemeProvider } from "@/shared/theme";
import { TooltipProvider } from "@/shared/ui/tooltip";
import "./styles.css";

const router = createAppRouter();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <TooltipProvider delayDuration={300}>
          <AppRouterProvider router={router} />
        </TooltipProvider>
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
);

registerServiceWorker();
