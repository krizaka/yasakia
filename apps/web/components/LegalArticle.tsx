import { Mascot } from "@krizaka/ui/mascots";
import { Page } from "@krizaka/ui/page";
import { PageHero } from "@krizaka/ui/page-hero";

import { getDictionary, type Locale, translator } from "@/lib/i18n";
import { LEGAL_UPDATED, LEGAL_VERSION } from "@/lib/site";

import { Rich } from "./Rich";

interface Section {
  id: string;
  title: string;
  paragraphs: string[];
}

/** The regional form of each language (Yasakia is a Canadian app). */
const INTL_TAG: Record<Locale, string> = { en: "en-CA", fr: "fr-CA" };

/** The date of the legal pages, written in the page's language. */
export function legalDate(locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_TAG[locale], { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${LEGAL_UPDATED}T12:00:00Z`));
}

/**
 * A legal page (privacy, terms): the hero with the page's bird — the falcon watches over what is kept — a table of
 * contents, then each section's paragraphs, all from messages/<locale>.json.
 */
export function LegalArticle({ locale, page }: { locale: Locale; page: "privacy" | "terms" }) {
  const t = translator(locale);
  const content = getDictionary(locale)[page];
  const sections = content.sections as Section[];
  return (
    <main>
      <PageHero
        eyebrow={content.eyebrow}
        title={content.title}
        lead={content.lead}
        size="narrow"
        aside={<Mascot bird={page === "privacy" ? "falcon" : "lovebird"} mood="welcome" size={132} />}
      >
        <p className="text-xs text-fg-muted">{t("chrome.updated", { date: legalDate(locale), version: LEGAL_VERSION })}</p>
      </PageHero>
      <Page size="narrow" className="pb-8">
        <nav aria-labelledby="toc-title" className="mb-10 rounded-2xl border border-border-default bg-surface-1 p-5">
          <p id="toc-title" className="mb-2 text-xs font-semibold uppercase tracking-widest text-fg-accent">
            {t("chrome.onThisPage")}
          </p>
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-fg-secondary underline-offset-4 hover:text-fg hover:underline">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="flex flex-col gap-10">
          {sections.map((section) => (
            <section key={section.id} aria-labelledby={section.id} className="scroll-mt-24">
              <h2 id={section.id} className="mb-3 font-display text-2xl font-bold tracking-tight text-fg">
                {section.title}
              </h2>
              <div className="flex flex-col gap-3 leading-relaxed text-fg-secondary">
                {section.paragraphs.map((paragraph, i) => (
                  <p key={i}>
                    <Rich text={paragraph} />
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Page>
    </main>
  );
}
