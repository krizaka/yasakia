import { Section } from "@krizaka/ui/page";

import { getDictionary, type Locale } from "@/lib/i18n";
import type { WHAT_WORKS } from "@/lib/what-works";

/** What already runs, said honestly: one line per part, « Fonctionne » only for what the code runs today (a test holds it). */
export function WhatWorks({ locale, items }: { locale: Locale; items: typeof WHAT_WORKS }) {
  const t = getDictionary(locale).home.works;
  return (
    <Section id="works" title={t.label} lead={t.lead} reveal divider>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {items.map((w) => (
          <li key={w.id} className="rounded-xl border border-border-default bg-surface-1 p-4">
            <p className="m-0 flex items-center justify-between gap-2 font-semibold text-fg">
              {t.items[w.id].title}
              <span className={w.status === "working" ? "shrink-0 text-xs font-semibold text-fg-accent" : "shrink-0 text-xs font-semibold text-fg-muted"}>{w.status === "working" ? t.working : t.development}</span>
            </p>
            <p className="mt-1 mb-0 text-sm text-fg-secondary">{t.items[w.id].text}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
