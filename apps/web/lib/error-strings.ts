import { createI18n } from "@krizaka/i18n";

import en from "@/messages/errors/en.json";
import fr from "@/messages/errors/fr.json";

/**
 * The words of the error pages, in their own small catalogue (messages/errors/<locale>.json, checked like the main one):
 * the error boundaries are client components, and they must not carry the whole legal text to every browser.
 */
export type ErrorLocale = "en" | "fr";
const errors = createI18n<typeof en, ErrorLocale>({ en, fr }, { defaultLocale: "en" });

/** The translator of the error pages for an address's locale segment (English for anything else). */
export const errorStrings = (locale: string | undefined) => errors.translator(errors.asLocale(locale ?? "en"));
export const errorLocale = (locale: string | undefined): ErrorLocale => errors.asLocale(locale ?? "en");
