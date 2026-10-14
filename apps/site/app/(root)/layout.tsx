import type { Metadata, Viewport } from "next";

import { RootShell } from "@/components/RootShell";
import { getDictionary } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export function generateMetadata(): Metadata {
  const t = getDictionary("en");
  return { metadataBase: new URL(SITE_URL), title: { default: t.meta.siteName, template: t.meta.titleTemplate.replace("{title}", "%s") }, description: t.meta.description, applicationName: t.meta.siteName, authors: [{ name: "Krizaka", url: "https://www.krizaka.com" }] };
}

/** The English pages, at the root of the site (`/`, `/how-it-works/`, `/demo/`). */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <RootShell locale="en">{children}</RootShell>;
}
