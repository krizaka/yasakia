import "../app/globals.css";
import "@krizaka/ui/blocks.css";

import { MotionObserver } from "@krizaka/ui/motion";
import { ThemeProvider, ThemeScript } from "@krizaka/ui/theme";

import type { Locale } from "@/lib/i18n";

/** The `<html>` of every page, in its language and the reader's theme (`kz-theme`: dark · light · system), no flash. */
export function RootShell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <html lang={locale} suppressHydrationWarning>
      {/* eslint-disable-next-line @next/next/no-head-element -- the root layout of an App Router page: the theme script runs before the first paint */}
      <head>
        <ThemeScript defaultMode="system" />
      </head>
      <body className="brand-yasakia min-h-screen bg-surface-0 text-fg antialiased selection:bg-accent selection:text-on-accent">
        <ThemeProvider defaultMode="system">{children}</ThemeProvider>
        <MotionObserver />
      </body>
    </html>
  );
}
