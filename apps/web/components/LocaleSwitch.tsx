"use client";

import { languagesFor,LanguageSwitch } from "@krizaka/ui/language-switch";
import Link from "next/link";

/** The family's language switch for the legal pages' header (a server component cannot call the client-side `languagesFor`). */
export function LocaleSwitch({ label, current, path }: { label: string; current: string; path: string }) {
  return <LanguageSwitch label={label} current={current} languages={languagesFor(path)} linkAs={Link} />;
}
