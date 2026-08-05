import { PWAContext } from "@/context/PWAContext";
import { useContext } from "react";

export function usePWA() {
  const context = useContext(PWAContext);
  if (context === null) {
    throw new Error("usePWA must be used within a PWAProvider");
  }
  return context;
}
