import type { Metadata, Viewport } from "next";

import { RootShell } from "@/components/RootShell";
import { getDictionary } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

/** What every page of the language shares; each page sets its own canonical, title and cards (lib/seo.ts). */
export function generateMetadata(): Metadata {
  const t = getDictionary("en");
  return { metadataBase: new URL(SITE_URL), title: { default: t.meta.siteName, template: t.meta.titleTemplate.replace("{title}", "%s") }, description: t.meta.description, applicationName: t.meta.siteName, icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }], apple: "/apple-touch-icon.png" }, manifest: "/manifest.webmanifest", authors: [{ name: "Krizaka", url: "https://www.krizaka.com" }] };
}

/** The English pages, at the root of the site (`/`, `/how-it-works/`, `/demo/`). */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <RootShell locale="en">{children}</RootShell>;
}
