import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "bb-theme";

const read = (): Theme => {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
};

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

/** Applies `.dark` on <html>. index.html runs the same logic inline before first paint, so there's no flash. */
function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  // An explicit choice overrides the media-based pair in index.html.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", dark ? "#121a15" : "#ffffff");
    meta.removeAttribute("media");
  }
}

const ThemeContext = createContext<{ theme: Theme; resolved: "light" | "dark"; setTheme: (t: Theme) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(read);
  const [systemDark, setSystemDark] = useState(prefersDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => apply(theme), [theme, systemDark]);

  const setTheme = useCallback((next: Theme) => {
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // ignore
    }
    setThemeState(next);
  }, []);

  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme() outside ThemeProvider");
  return value;
}
