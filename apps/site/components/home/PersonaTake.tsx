import { Section } from "@krizaka/ui/page";

import { ButtonLink } from "@/components/ButtonLink";
import { getDictionary, type Locale } from "@/lib/i18n";
import { JOURNEY_STEPS } from "@/lib/landing";
import { take } from "@/lib/media";
import { pagePath } from "@/lib/site";

import { PersonaShowcase } from "./PersonaShowcase";

/**
 * Camille's real journey, phone first: the StepShowcase of @krizaka/ui — one phone, five steps, each step its own cut of the one
 * recorded run (photos checked, the conversation, the batch, a message typed by hand with its signal, a photo and a voice message).
 * Every step is also a numbered line of text, readable without any script. The full recording is /demo.
 */
export function PersonaTake({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).landing.journey;
  const steps = JOURNEY_STEPS.map((id) => {
    const media = take(id);
    return { id, title: t.steps[id].title, description: t.steps[id].text, poster: media.poster, alt: t.steps[id].alt, video: { webm: media.webm, mp4: media.mp4 } };
  });
  return (
    <Section id="journey" eyebrow={t.eyebrow} title={t.title} lead={t.lead} reveal divider>
      <div className="flex flex-col gap-6">
        <PersonaShowcase label={t.phoneLabel} steps={steps} play={t.play} pause={t.pause} stepOf={t.stepOf} />
        <ol className="sr-only" data-testid="persona-steps">
          {JOURNEY_STEPS.map((id) => (
            <li key={id}>
              {t.steps[id].title}. {t.steps[id].text}
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
    </Section>
  );
}
