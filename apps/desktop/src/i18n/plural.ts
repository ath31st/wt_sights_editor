import type { LocaleId, PluralForms } from "./types";

export function selectPlural(locale: LocaleId, n: number): keyof PluralForms {
  if (locale === "zh") {
    return "other";
  }
  if (locale === "ru") {
    const abs = Math.abs(n);
    const mod10 = abs % 10;
    const mod100 = abs % 100;
    if (mod100 >= 11 && mod100 <= 14) {
      return "many";
    }
    if (mod10 === 1) {
      return "one";
    }
    if (mod10 >= 2 && mod10 <= 4) {
      return "few";
    }
    return "many";
  }
  return n === 1 ? "one" : "other";
}

export function formatPlural(locale: LocaleId, forms: PluralForms, n: number): string {
  const form = selectPlural(locale, n);
  return forms[form] ?? forms.other;
}
