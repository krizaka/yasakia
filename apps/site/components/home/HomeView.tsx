import { ForwardIcon, IntroIcon, MessageIcon, ShieldIcon, UsersIcon } from "@krizaka/icons";
import { Button } from "@krizaka/ui/button";
import { LandingPage } from "@krizaka/ui/landing-page";
import { MascotQuote } from "@krizaka/ui/mascot-quote";
import { NumberTicker } from "@krizaka/ui/number-ticker";
import { Section } from "@krizaka/ui/page";

import { ButtonLink } from "@/components/ButtonLink";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getDictionary, type Locale } from "@/lib/i18n";
import { FIGURES } from "@/lib/landing";
import { contactHref, REPO_URL } from "@/lib/site";
import { WHAT_WORKS } from "@/lib/what-works";

import { ComparisonSection } from "./ComparisonSection";
import { FaqSection } from "./FaqSection";
import { HeroPhone } from "./HeroPhone";
import { NotDoing } from "./NotDoing";
import { PersonaTake } from "./PersonaTake";
import { RealPeople } from "./RealPeople";
import { WhatWorks } from "./WhatWorks";

const ICONS = { real: <UsersIcon />, intros: <IntroIcon />, words: <MessageIcon />, signal: <ShieldIcon /> } as const;

/**
 * yasakia.com — the product landing template of @krizaka/ui (`LandingPage`): a split hero with the product in a phone, a band of
 * the product's own figures (`NumberTicker`, read from `lib/landing.ts`), a bento of what it promises, then our sections —
 * real people, Camille's journey on a phone, what Yasakia refuses, the comparison, the lovebird's promise, the FAQ — and the
 * closing call. Registration is closed: the one action is « talk to us », and the code. Orazaka, the engine, is named in the proof
 * line and in one FAQ answer.
 */
export function HomeView({ locale }: { locale: Locale }) {
  const d = getDictionary(locale);
  const t = d.landing;
  return (
    <>
      <SiteHeader locale={locale} current="home" />
      <main id="main">
        <LandingPage
          eyebrow={t.eyebrow}
          title={t.title}
          lead={
            <>
              {t.lead}
              <span role="note" className="mt-4 block max-w-prose text-sm text-fg-muted">
                {t.status}
              </span>
            </>
          }
          visualLabel={t.hero.visualLabel}
          visual={<HeroPhone locale={locale} />}
          actions={
            <>
              <Button asChild variant="primary" size="lg" shape="cut" shimmer magnetic className="w-full sm:w-auto">
                <a href={contactHref("dev-yasakia-hero")}>
                  {t.ctaTalk} <ForwardIcon size={16} strokeWidth={2.25} />
                </a>
              </Button>
              <Button asChild variant="secondary" size="lg" shape="cut" className="w-full sm:w-auto">
                <a href="#journey">{t.ctaJourney}</a>
              </Button>
            </>
          }
          proofs={[
            { value: <NumberTicker value={FIGURES.batchMax} locale={locale} />, label: t.figures.batch },
            { value: <NumberTicker value={FIGURES.photosMin} locale={locale} />, label: t.figures.photos },
            { value: <NumberTicker value={FIGURES.introDays} locale={locale} />, label: t.figures.days },
          ]}
          featuresHeading={{ eyebrow: t.features.eyebrow, title: t.features.title, lead: t.features.lead }}
          features={[
            { id: "real", size: "lg", icon: ICONS.real, title: t.features.items.real.title, text: t.features.items.real.text },
            { id: "intros", size: "md", icon: ICONS.intros, title: t.features.items.intros.title, text: t.features.items.intros.text },
            { id: "words", size: "sm", icon: ICONS.words, title: t.features.items.words.title, text: t.features.items.words.text },
            { id: "signal", size: "sm", icon: ICONS.signal, title: t.features.items.signal.title, text: t.features.items.signal.text },
          ]}
          closing={{
            title: t.closing.title,
            body: t.closing.body,
            actions: (
              <>
                <Button asChild variant="primary" size="lg" shape="cut">
                  <a href={contactHref("dev-yasakia-closing")}>{t.ctaTalk}</a>
                </Button>
                <ButtonLink href={REPO_URL}>{d.home.closingSource}</ButtonLink>
              </>
            ),
          }}
        >
          <RealPeople locale={locale} />
          <PersonaTake locale={locale} />
          <NotDoing locale={locale} />
          <ComparisonSection locale={locale} />
          <Section id="promise" spacing="sm" reveal>
            <MascotQuote bird="lovebird" mood="welcome" label={t.promise.label} variant="callout">
              {t.promise.text}
            </MascotQuote>
          </Section>
          <WhatWorks locale={locale} items={WHAT_WORKS} />
          <FaqSection locale={locale} />
        </LandingPage>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
