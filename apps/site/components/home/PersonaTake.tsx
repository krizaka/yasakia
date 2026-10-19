import { Section } from "@krizaka/ui/page";
import { DeviceFrame } from "@krizaka/ui/step-showcase";

import { ButtonLink } from "@/components/ButtonLink";
import { format, getDictionary, type Locale } from "@/lib/i18n";
import { JOURNEY_STEPS } from "@/lib/landing";
import { pagePath } from "@/lib/site";

/**
 * Camille's real journey, phone first: one phone, five steps one under the other (a numbered list, readable without any
 * script). The words quoted are the ones the run's script has her say (`scripts/dev-journey.mjs`); every other step says what the
 * screen did, from the run's captions — no invented reply, no invented profile. The full recording is /demo.
 */
export function PersonaTake({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).landing.journey;
  return (
    <Section id="journey" eyebrow={t.eyebrow} title={t.title} lead={t.lead} reveal divider>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12">
        <DeviceFrame kind="phone" className="mx-auto w-[16rem] max-w-full lg:mx-0" aria-label={t.phoneLabel}>
          <ol className="m-0 flex max-h-[28rem] list-none flex-col gap-3 overflow-hidden bg-surface-0 px-4 pb-4 pt-8" data-testid="persona-phone">
            {JOURNEY_STEPS.map((id, i) => {
              const step = t.steps[id];
              const says = "says" in step ? step.says : null;
              return (
                <li key={id} className="flex flex-col gap-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">{format(t.stepOf, { n: i + 1, total: JOURNEY_STEPS.length })}</span>
                  {says ? (
                    <span className="max-w-[90%] self-end rounded-2xl rounded-br-sm bg-accent/20 px-3 py-2 text-xs leading-snug text-fg">{says}</span>
                  ) : (
                    <span className="rounded-xl border border-border-default bg-surface-1 px-3 py-2 text-xs font-semibold text-fg">{step.title}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </DeviceFrame>
        <div className="flex flex-col gap-5">
          <ol className="m-0 flex list-none flex-col gap-4 p-0" data-testid="persona-steps">
            {JOURNEY_STEPS.map((id, i) => (
              <li key={id} className="flex gap-4" data-reveal={i}>
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full border border-border-default bg-surface-1 font-mono text-sm font-semibold text-fg-accent">
                  {i + 1}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold text-fg">{t.steps[id].title}</span>
                  <span className="text-sm leading-relaxed text-fg-secondary">{t.steps[id].text}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="m-0 max-w-[70ch] text-xs leading-relaxed text-fg-muted">{t.note}</p>
          <div>
            <ButtonLink href={pagePath(locale, "demo")} size="md">
              {t.demo}
            </ButtonLink>
          </div>
        </div>
      </div>
    </Section>
  );
}
