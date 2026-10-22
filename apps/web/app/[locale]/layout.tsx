import "../globals.css";
import "@krizaka/ui/blocks.css";

import { ThemeProvider, ThemeScript } from "@krizaka/ui/theme";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";

import { getDictionary, type Locale, LOCALES } from "@/lib/i18n";
import { indexable } from "@/lib/indexing";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(LOCALES.includes(locale as Locale) ? (locale as Locale) : "en");
  return {
    title: { default: t.meta.siteName, template: t.meta.titleTemplate.replace("{title}", "%s") },
    description: t.meta.description,
    applicationName: t.meta.siteName,
    authors: [{ name: "Krizaka", url: "https://krizaka.com" }],
    alternates: { languages: { en: "/en", fr: "/fr" } },
    ...(indexable() ? {} : { robots: { index: false, follow: false, noarchive: true } }),
  };
}

/** The root of the three web pages, in the language of the address (`/en/…`, `/fr/…`), in the reader's theme. */
export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!LOCALES.includes(locale as Locale)) notFound();
  return (
    <html lang={locale} data-surface="product" suppressHydrationWarning>
      <head>
        {/* Applies the persisted theme (`kz-theme`: dark · light · system) before the first paint: no flash. */}
        <ThemeScript defaultMode="system" />
      </head>
      <body className="min-h-screen bg-surface-0 text-fg antialiased selection:bg-accent selection:text-on-accent">
        <ThemeProvider defaultMode="system">{children}</ThemeProvider>
      </body>
    </html>
  );
}
