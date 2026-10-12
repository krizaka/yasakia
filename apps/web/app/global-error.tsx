"use client";

import "./globals.css";

import { ThemeProvider, ThemeScript } from "@krizaka/ui/theme";
import { useParams } from "next/navigation";

import { ServerError } from "@/components/errors/ServerError";
import { errorLocale, errorStrings } from "@/lib/error-strings";

/**
 * When the root layout itself fails, Next renders this document instead of it: the same styles, the person's theme
 * (`kz-theme`, applied before paint), and the falcon's page in the address's language.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = errorLocale(params?.locale);
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <title>{errorStrings(locale)("serverMetaTitle")}</title>
        <meta name="robots" content="noindex" />
        <ThemeScript defaultMode="system" />
      </head>
      <body className="min-h-screen bg-surface-0 text-fg antialiased">
        <ThemeProvider defaultMode="system">
          <ServerError locale={locale} digest={error.digest} retry={retry} as="main" />
        </ThemeProvider>
      </body>
    </html>
  );
}
