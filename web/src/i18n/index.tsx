import React, { createContext, useContext, useState, useCallback } from "react";
import { ptPT } from "@/i18n/pt-PT";
import { enUS } from "@/i18n/en-US";

export type Dictionary = typeof ptPT;
export type Language = "pt-PT" | "en-US";

const STORAGE_KEY = "badminton-lang";

function getInitialLang(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "pt-PT" || stored === "en-US") return stored;
  } catch {}
  return navigator.language.startsWith("pt") ? "pt-PT" : "en-US";
}

interface LangContextValue {
  lang: Language;
  dict: Dictionary;
  setLanguage: (l: Language) => void;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>(getInitialLang);

  const setLanguage = useCallback((l: Language) => {
    setLang(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  }, []);

  const dict = lang === "pt-PT" ? ptPT : enUS;

  return (
    <LangContext.Provider value={{ lang, dict, setLanguage }}>
      {children}
    </LangContext.Provider>
  );
}

export function useDictionary(): Dictionary {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useDictionary must be used within LanguageProvider");
  return ctx.dict;
}

export function useLanguage() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return { lang: ctx.lang, setLanguage: ctx.setLanguage };
}
