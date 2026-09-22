import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CatalogTank } from "@wt_sights_editor/core";
import { de } from "./de";
import { en } from "./en";
import { formatPlural } from "./plural";
import { ru } from "./ru";
import type {
  CountryCode,
  Dictionary,
  LocaleConfig,
  LocaleId,
  MessageKey,
  PluralKey,
  Translate,
  TranslateVars,
} from "./types";
import { COUNTRY_CODES, LOCALE_IDS } from "./types";
import { zh } from "./zh";

export type { LocaleId, MessageKey, PluralKey, Translate, TranslateVars } from "./types";

export const LOCALES: readonly LocaleConfig[] = [
  { id: "ru", nativeLabel: "RU", enabled: true },
  { id: "en", nativeLabel: "EN", enabled: true },
  { id: "de", nativeLabel: "DE", enabled: false },
  { id: "zh", nativeLabel: "ZH", enabled: false },
];

export const ENABLED_LOCALES = LOCALES.filter((item) => item.enabled);

const dictionaries: Record<LocaleId, Dictionary> = { ru, en, de, zh };

const HTML_LANG: Record<LocaleId, string> = {
  ru: "ru",
  en: "en",
  de: "de",
  zh: "zh-CN",
};

export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value == null ? match : String(value);
  });
}

export function parseLocale(value: unknown): LocaleId | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return (LOCALE_IDS as readonly string[]).includes(value) ? (value as LocaleId) : undefined;
}

export function detectLocale(): LocaleId {
  const lang = typeof navigator === "undefined" ? "" : navigator.language.toLowerCase();
  if (lang.startsWith("en")) {
    return "en";
  }
  return "ru";
}

export function translate(locale: LocaleId, key: MessageKey, vars?: TranslateVars): string {
  return interpolate(dictionaries[locale].messages[key], vars);
}

export function translatePlural(locale: LocaleId, key: PluralKey, n: number): string {
  return interpolate(formatPlural(locale, dictionaries[locale].plurals[key], n), { n });
}

export function countryLabel(locale: LocaleId, code: string): string {
  if ((COUNTRY_CODES as readonly string[]).includes(code)) {
    return dictionaries[locale].countries[code as CountryCode];
  }
  return code;
}

export function tankDisplayName(tank: CatalogTank, locale: LocaleId): string {
  if (locale === "ru") {
    return tank.nameRu || tank.nameEn || tank.id;
  }
  return tank.nameEn || tank.nameRu || tank.id;
}

export function formatCatalogDate(iso: string | undefined, locale: LocaleId): string | undefined {
  if (!iso) {
    return undefined;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return iso;
  }
  if (locale === "en" || locale === "zh") {
    return iso;
  }
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function catalogStamp(
  patchName: string | undefined,
  catalogDate: string | undefined,
  locale: LocaleId,
): string {
  return [patchName, formatCatalogDate(catalogDate, locale)].filter(Boolean).join(" · ");
}

type I18nContextValue = {
  locale: LocaleId;
  setLocale: (locale: LocaleId) => void;
  t: Translate;
  tp: (key: PluralKey, n: number) => string;
  countryLabel: (code: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<LocaleId>(detectLocale);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale];
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const labelCountry = (code: string) => countryLabel(locale, code);
    return {
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      tp: (key, n) => translatePlural(locale, key, n),
      countryLabel: labelCountry,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useT must be used within I18nProvider");
  }
  return ctx;
}
