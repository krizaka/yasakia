import { ComparisonTable } from "@krizaka/ui/comparison-table";
import { Section } from "@krizaka/ui/page";

import { getDictionary, type Locale } from "@/lib/i18n";
import { COMPARISON_ROWS } from "@/lib/landing";

/** Yasakia, a swiping app, an app that writes for you — neutral, true of the kinds of app (no brand is named). */
export function ComparisonSection({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).landing.comparison;
  const rows = COMPARISON_ROWS.map((id) => ({ id, topic: t.rows[id].topic, answers: { yasakia: t.rows[id].yasakia, swipe: t.rows[id].swipe, ghost: t.rows[id].ghost } }));
  return (
    <Section id="comparison" eyebrow={t.eyebrow} title={t.title} lead={t.lead} reveal divider>
      <ComparisonTable label={t.title} topicLabel={t.topic} columns={[{ id: "yasakia", label: t.columns.yasakia }, { id: "swipe", label: t.columns.swipe }, { id: "ghost", label: t.columns.ghost }]} highlight="yasakia" rows={rows} />
    </Section>
  );
}
