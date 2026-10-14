import { buttonVariants } from "@krizaka/ui/button";
import { Mascot } from "@krizaka/ui/mascots";
import { Page } from "@krizaka/ui/page";
import { PageHero } from "@krizaka/ui/page-hero";
import type { Metadata } from "next";

import { Rich } from "@/components/Rich";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { asLocale, getDictionary } from "@/lib/i18n";
import { contactHref } from "@/lib/site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const t = getDictionary(asLocale((await params).locale));
  return {
    title: t.deleteAccount.metaTitle,
    description: t.deleteAccount.lead,
    alternates: { canonical: `/${(await params).locale}/delete-account`, languages: { en: "/en/delete-account", fr: "/fr/delete-account" } },
  };
}

const listCard = "rounded-2xl border border-border-default bg-surface-1 p-5 sm:p-6";

/**
 * How to delete a Yasakia account — the page the stores require: the steps in the app, the way without it, what is
 * deleted at once, what goes within 30 days, and what remains (nothing that identifies the person).
 */
export default async function DeleteAccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const t = getDictionary(locale).deleteAccount;
  return (
    <>
      <SiteHeader locale={locale} current="deleteAccount" />
      <main>
        <PageHero eyebrow={t.eyebrow} title={t.title} lead={t.lead} size="narrow" aside={<Mascot bird="falcon" mood="welcome" size={132} />} />
        <Page size="narrow" className="flex flex-col gap-6 pb-8">
          <section aria-labelledby="in-app" className={listCard}>
            <h2 id="in-app" className="mb-3 font-display text-xl font-bold text-fg">
              {t.inAppTitle}
            </h2>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-fg-secondary marker:font-semibold marker:text-fg-accent">
              {t.inAppSteps.map((step, i) => (
                <li key={i}>
                  <Rich text={step} />
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="without-app" className={listCard}>
            <h2 id="without-app" className="mb-3 font-display text-xl font-bold text-fg">
              {t.withoutAppTitle}
            </h2>
            <p className="mb-4 text-fg-secondary">{t.withoutApp}</p>
            <a href={contactHref("yasakia-delete-account")} className={buttonVariants({ variant: "secondary", shape: "pill" })}>
              {t.contactAction}
            </a>
          </section>
          <div className="grid gap-6 sm:grid-cols-2">
            <section aria-labelledby="deleted" className={listCard}>
              <h2 id="deleted" className="mb-3 font-display text-xl font-bold text-fg">
                {t.deletedTitle}
              </h2>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-fg-secondary">
                {t.deleted.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="kept" className={listCard}>
              <h2 id="kept" className="mb-3 font-display text-xl font-bold text-fg">
                {t.keptTitle}
              </h2>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-fg-secondary">
                {t.kept.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
          <p className="text-sm text-fg-muted">{t.exportHint}</p>
        </Page>
      </main>
      <SiteFooter locale={locale} source="yasakia-delete-account" />
    </>
  );
}
