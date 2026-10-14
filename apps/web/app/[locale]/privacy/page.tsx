import type { Metadata } from "next";

import { LegalArticle } from "@/components/LegalArticle";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { asLocale, getDictionary } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(asLocale((await params).locale));
  return { title: t.privacy.metaTitle, description: t.privacy.lead, alternates: { canonical: `/${(await params).locale}/privacy`, languages: { en: "/en/privacy", fr: "/fr/privacy" } } };
}

/** What Yasakia keeps, where, for how long, and how it is deleted — the page the stores and the app link to. */
export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  return (
    <>
      <SiteHeader locale={locale} current="privacy" />
      <LegalArticle locale={locale} page="privacy" />
      <SiteFooter locale={locale} source="yasakia-privacy" />
    </>
  );
}
