import { CheckIcon, EyeOffIcon, ImageIcon, LockIcon, ShieldIcon } from "@krizaka/icons";
import { Section } from "@krizaka/ui/page";

import { getDictionary, type Locale } from "@/lib/i18n";

const CHECKS = [
  { id: "count", icon: <ImageIcon /> },
  { id: "face", icon: <CheckIcon /> },
  { id: "private", icon: <LockIcon /> },
  { id: "nobody", icon: <EyeOffIcon /> },
] as const;

/** « De vraies personnes »: the photo rule in four short cards, then the engine line — the one place the home names Orazaka (the proof). */
export function RealPeople({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).landing.people;
  return (
    <Section id="people" eyebrow={t.eyebrow} title={t.title} lead={t.lead} reveal divider>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-4" data-testid="people-checks">
        {CHECKS.map((c, i) => (
          <li key={c.id} className="flex flex-col gap-2 rounded-2xl border border-border-default bg-surface-1 p-5" data-reveal={i}>
            <span aria-hidden className="text-fg-accent [&_svg]:size-6">
              {c.icon}
            </span>
            <p className="m-0 text-base font-semibold text-fg">{t.checks[c.id].title}</p>
            <p className="m-0 text-sm leading-relaxed text-fg-secondary">{t.checks[c.id].text}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 mb-0 inline-flex max-w-[70ch] items-start gap-2 text-sm text-fg-muted">
        <span aria-hidden className="mt-0.5 shrink-0 text-fg-accent [&_svg]:size-4">
          <ShieldIcon />
        </span>
        {t.powered}
      </p>
    </Section>
  );
}
