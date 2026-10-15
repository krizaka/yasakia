"use client";

import { configureKrizakaFetch, KrizakaQueryProvider } from "@krizaka/query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BASE_PATH } from "@/lib/client";
import type { Locale } from "@/lib/i18n";
import type { ConsoleMessages } from "@/lib/i18n-client";
import { I18nProvider } from "@/lib/i18n-client";

/** The console's client roots: its language (only its own slice of the catalogue), and server state through @krizaka/query. */
export function ConsoleProviders({ locale, messages, children }: { locale: Locale; messages: ConsoleMessages; children: React.ReactNode }) {
  const router = useRouter();
  useState(() => configureKrizakaFetch({ baseUrl: BASE_PATH }));
  return (
    <I18nProvider locale={locale} messages={messages}>
      <KrizakaQueryProvider onUnauthorized={() => router.replace(`/app/${locale}/sign-in`)}>{children}</KrizakaQueryProvider>
    </I18nProvider>
  );
}
