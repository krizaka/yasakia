import { DecisionList } from "@krizaka/ui/decision-list";
import { Section } from "@krizaka/ui/page";

import { getDictionary, type Locale } from "@/lib/i18n";
import { NOT_DOING } from "@/lib/landing";

/** « Ce que Yasakia ne fait pas »: three refusals, each with its reason and what it costs the reader — said honestly. */
export function NotDoing({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).landing.notDoing;
  return (
    <Section id="not-doing" eyebrow={t.eyebrow} title={t.title} lead={t.lead} reveal divider>
      <DecisionList labels={t.labels} decisions={NOT_DOING.map((id) => ({ id, ...t.items[id] }))} />
    </Section>
  );
}
