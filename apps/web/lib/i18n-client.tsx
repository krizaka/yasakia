"use client";

import { createI18nReact } from "@krizaka/i18n/react";
import { useCallback } from "react";

import type { Locale, Messages } from "./i18n";

/** The console's client side: it receives only the `console` slice of the active language (the legal pages' texts stay on the server). */
export type ConsoleMessages = Pick<Messages, "console">;

export const { I18nProvider, useI18n } = createI18nReact<ConsoleMessages, Locale>({ locales: ["en", "fr"], defaultLocale: "en" });

/** The console's translator for keys built at run time (`errors.${code}`): a message of the active language, `{placeholders}` filled. Stable between renders (safe in `useMemo` deps). */
export function useSay() {
  const { t, locale } = useI18n();
  const say = useCallback((key: string, vars?: Record<string, string | number>): string => (t as unknown as (k: string, v?: Record<string, string | number>) => string)(`console.${key}`, vars), [t]);
  return { say, locale };
}
