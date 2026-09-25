"use client";

import * as React from "react";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import mr from "@/i18n/mr.json";
import { translateBatch } from "@/i18n/translateClient";
import { AutoTranslate } from "@/i18n/AutoTranslate";

export type LanguageCode = string;
export type SupportedLanguage = LanguageCode;

const BASE_LANGUAGE: LanguageCode = "en";
const LANGUAGE_STORAGE_KEY = "anndata.language";
const CACHE_PREFIX = "anndata.i18n.cache.";

const baseDict = en as Record<string, string>;
const baseKeys = Object.keys(baseDict);

const STATIC_DICTIONARIES: Record<string, Record<string, string>> = {
  hi: hi as Record<string, string>,
  mr: mr as Record<string, string>,
};

function hashDictionary(dict: Record<string, string>): string {
  const serialized = JSON.stringify(dict);
  let hash = 5381;
  for (let i = 0; i < serialized.length; i++) {
    hash = (hash * 33) ^ serialized.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

const SOURCE_HASH = hashDictionary(baseDict);

function cacheKey(lang: string) {
  return `${CACHE_PREFIX}${lang}.${SOURCE_HASH}`;
}

function readCache(lang: string): Record<string, string> | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(lang));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(lang: string, dict: Record<string, string>) {
  try {
    window.localStorage.setItem(cacheKey(lang), JSON.stringify(dict));
  } catch {
    // localStorage unavailable/full — translations just won't persist across reloads
  }
}

function interpolate(template: string, vars?: Record<string, string>): string {
  if (!vars) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? "");
}

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, vars?: Record<string, string>) => string;
  isTranslating: boolean;
}

const I18nContext = React.createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<LanguageCode>(BASE_LANGUAGE);
  const [translations, setTranslations] = React.useState<Record<string, string> | null>(null);
  const [isTranslating, setIsTranslating] = React.useState(false);
  const activeRequestId = React.useRef(0);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored) setLanguageState(stored);
  }, []);

  React.useEffect(() => {
    if (language === BASE_LANGUAGE) {
      setTranslations(null);
      setIsTranslating(false);
      return;
    }

    if (STATIC_DICTIONARIES[language]) {
      setTranslations(STATIC_DICTIONARIES[language]);
      setIsTranslating(false);
      return;
    }

    const cached = readCache(language);
    if (cached) {
      setTranslations(cached);
      setIsTranslating(false);
      return;
    }

    const requestId = ++activeRequestId.current;
    setIsTranslating(true);

    const uniqueTexts = Array.from(new Set(baseKeys.map((key) => baseDict[key])));

    translateBatch(uniqueTexts, language, BASE_LANGUAGE)
      .then((translatedUnique) => {
        if (activeRequestId.current !== requestId) return;
        const byText = new Map(uniqueTexts.map((text, i) => [text, translatedUnique[i]]));
        const dict: Record<string, string> = {};
        baseKeys.forEach((key) => {
          const source = baseDict[key];
          dict[key] = byText.get(source) || source;
        });
        setTranslations(dict);
        writeCache(language, dict);
      })
      .catch(() => {
        if (activeRequestId.current !== requestId) return;
        setTranslations(null);
      })
      .finally(() => {
        if (activeRequestId.current === requestId) setIsTranslating(false);
      });
  }, [language]);

  const setLanguage = React.useCallback((lang: LanguageCode) => {
    setLanguageState(lang);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  }, []);

  const t = React.useCallback(
    (key: string, vars?: Record<string, string>) => {
      const translated = language !== BASE_LANGUAGE ? translations?.[key] : undefined;
      const template = translated || baseDict[key] || key;
      return interpolate(template, vars);
    },
    [language, translations],
  );

  const value = React.useMemo(
    () => ({ language, setLanguage, t, isTranslating }),
    [language, setLanguage, t, isTranslating],
  );

  return (
    <I18nContext.Provider value={value}>
      {children}
      <AutoTranslate />
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}
