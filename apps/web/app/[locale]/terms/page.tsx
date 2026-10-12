import type { Metadata } from "next";

import { LegalArticle } from "@/components/LegalArticle";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { asLocale, getDictionary } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(asLocale((await params).locale));
  return { title: t.terms.metaTitle, description: t.terms.lead, alternates: { canonical: `/${(await params).locale}/terms`, languages: { en: "/en/terms", fr: "/fr/terms" } } };
}

/** The terms of use: 18+, honest profiles, how members treat each other, the agent, blocks, reports and sanctions. */
export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  return (
    <>
      <SiteHeader locale={locale} current="terms" />
      <LegalArticle locale={locale} page="terms" />
      <SiteFooter locale={locale} source="yazakia-terms" />
    </>
  );
}
