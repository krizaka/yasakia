import { Section } from "@krizaka/ui/page";

import { getDictionary, type Locale } from "@/lib/i18n";
import { FAQ_IDS as IDS } from "@/lib/landing";

/** Native disclosure elements (keyboard operable, no script) and the matching FAQPage JSON-LD — the markup describes what is on the page. */
export function FaqSection({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).landing.faq;
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: IDS.map((id) => ({ "@type": "Question", name: t.items[id].q, acceptedAnswer: { "@type": "Answer", text: t.items[id].a } })) };
  return (
    <Section id="faq" eyebrow={t.eyebrow} title={t.title} headingSize="sm" reveal divider>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <div className="mx-auto flex max-w-3xl flex-col gap-2" data-testid="faq">
        {IDS.map((id) => (
          <details key={id} className="group rounded-xl border border-border-default bg-surface-1 px-4 open:bg-surface-2">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-base font-semibold text-fg [&::-webkit-details-marker]:hidden">
              {t.items[id].q}
              <span aria-hidden className="shrink-0 text-fg-accent transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="m-0 max-w-[70ch] pb-4 text-sm leading-relaxed text-fg-secondary">{t.items[id].a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
