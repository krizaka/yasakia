import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";

import { RootShell } from "@/components/RootShell";
import { getDictionary } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

/** French lives under /fr (English is the root of the site): the only prefixed language. */
export function generateStaticParams() {
  return [{ locale: "fr" }];
}

export const dynamicParams = false;

export function generateMetadata(): Metadata {
  const t = getDictionary("fr");
  return { metadataBase: new URL(SITE_URL), title: { default: t.meta.siteName, template: t.meta.titleTemplate.replace("{title}", "%s") }, description: t.meta.description, applicationName: t.meta.siteName, authors: [{ name: "Krizaka", url: "https://www.krizaka.com" }] };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr") notFound();
  return <RootShell locale="fr">{children}</RootShell>;
}
