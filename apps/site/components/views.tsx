import { YasakiaLogo } from "@krizaka/ui";
import { CtaPanel } from "@krizaka/ui/cta-panel";
import { HowItWorksPage } from "@krizaka/ui/how-it-works-page";
import { LandingPage } from "@krizaka/ui/landing-page";
import { Page, Section } from "@krizaka/ui/page";
import { PageHero } from "@krizaka/ui/page-hero";
import Link from "next/link";

import { CUES } from "@/lib/demo";
import { type Locale, translator } from "@/lib/i18n";
import { clip } from "@/lib/media";
import { contactHref, pagePath, REPO_URL } from "@/lib/site";
import { WHAT_WORKS } from "@/lib/what-works";

import { ButtonLink } from "./ButtonLink";
import { CaptionedVideo } from "./CaptionedVideo";
import { SiteFooter, SiteHeader } from "./SiteChrome";

function Status({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <p role="note" className="mt-4 inline-flex max-w-prose items-start gap-2 rounded-lg border border-border-default bg-surface-1 px-3 py-2 text-sm text-fg-secondary">
      <strong className="shrink-0 font-semibold text-fg-accent">{t("status.label")}</strong>
      <span>{t("status.text")}</span>
    </p>
  );
}

/** The landing: the promise beside the animated mark, four rules, the closing call. */
export function HomeView({ locale }: { locale: Locale }) {
  const t = translator(locale);
  const rules = ["talk", "batch", "both", "debrief"] as const;
  return (
    <>
      <SiteHeader locale={locale} current="home" />
      <main id="main">
        <LandingPage
          eyebrow={t("home.eyebrow")}
          title={t("home.title")}
          lead={
            <>
              {t("home.lead")}
              <Status locale={locale} />
            </>
          }
          actions={
            <>
              <ButtonLink href={pagePath(locale, "how-it-works")} variant="primary" shimmer>
                {t("home.ctaHow")}
              </ButtonLink>
              <ButtonLink href={pagePath(locale, "demo")}>{t("home.ctaDemo")}</ButtonLink>
            </>
          }
          visual={
            <div className="flex min-h-64 items-center justify-center py-8">
              <YasakiaLogo size={200} title="Yasakia" />
            </div>
          }
          visualLabel="yasakia.com"
          featuresHeading={{ title: t("home.principlesTitle"), lead: t("home.principlesLead") }}
          features={rules.map((id, i) => ({ id, title: t(`home.principles.${id}.title`), text: t(`home.principles.${id}.text`), size: i === 0 ? ("lg" as const) : ("sm" as const) }))}
          closing={{
            title: t("home.closingTitle"),
            body: t("home.closingLead"),
            actions: (
              <>
                <ButtonLink href={REPO_URL} variant="primary">
                  {t("home.closingSource")}
                </ButtonLink>
                <ButtonLink href={contactHref("dev-yasakia-home")}>{t("home.closingContact")}</ButtonLink>
              </>
            ),
          }}
        />
        <Section id="works" title={t("home.works.label")} lead={t("home.works.lead")} divider>
          <ul className="grid gap-3 sm:grid-cols-2">
            {WHAT_WORKS.map((w) => (
              <li key={w.id} className="rounded-xl border border-border-default bg-surface-1 p-4">
                <p className="flex items-center justify-between gap-2 font-semibold text-fg">
                  {t(`home.works.items.${w.id}.title`)}
                  <span className={w.status === "working" ? "shrink-0 text-xs font-semibold text-fg-accent" : "shrink-0 text-xs font-semibold text-fg-muted"}>
                    {t(w.status === "working" ? "home.works.working" : "home.works.development")}
                  </span>
                </p>
                <p className="mt-1 text-sm text-fg-secondary">{t(`home.works.items.${w.id}.text`)}</p>
              </li>
            ))}
          </ul>
        </Section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

/** How it works: the four steps of the loop, privacy by design, what it is built on. */
export function HowView({ locale }: { locale: Locale }) {
  const t = translator(locale);
  const steps = ["talk", "batch", "both", "debrief"] as const;
  const privacy = ["position", "photos", "realPeople", "typed", "media", "encrypted", "control", "honest"] as const;
  const stack = ["db", "ui", "ai"] as const;
  return (
    <>
      <SiteHeader locale={locale} current="how-it-works" />
      <main id="main">
        <HowItWorksPage
          brand="yasakia"
          eyebrow={t("how.eyebrow")}
          title={t("how.title")}
          lead={t("how.lead")}
          stepsLabel={t("how.eyebrow")}
          steps={steps.map((id) => ({ id, title: t(`how.steps.${id}.title`), text: t(`how.steps.${id}.text`) }))}
          linkAs={Link}
          closing={{
            title: t("home.closingTitle"),
            body: t("home.closingLead"),
            actions: (
              <>
                <ButtonLink href={pagePath(locale, "demo")} variant="primary">
                  {t("home.ctaDemo")}
                </ButtonLink>
                <ButtonLink href={REPO_URL}>{t("home.closingSource")}</ButtonLink>
              </>
            ),
          }}
        >
          <Section title={t("how.privacyTitle")} lead={t("how.privacyLead")}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {privacy.map((id) => (
                <li key={id} className="rounded-xl border border-border-default bg-surface-1 p-4 text-fg-secondary">
                  {t(`how.privacy.${id}`)}
                </li>
              ))}
            </ul>
          </Section>
          <Section title={t("how.stackTitle")} lead={t("how.stackLead")}>
            <ul className="grid gap-3 sm:grid-cols-3">
              {stack.map((id) => (
                <li key={id} className="rounded-xl border border-border-default bg-surface-1 p-4 text-fg-secondary">
                  {t(`how.stack.${id}`)}
                </li>
              ))}
            </ul>
          </Section>
        </HowItWorksPage>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

/** The demo: the real journey, recorded on the development site — one run, captioned in the page. Media come from the CDN only. */
export function DemoView({ locale }: { locale: Locale }) {
  const t = translator(locale);
  const media = clip("loop");
  return (
    <>
      <SiteHeader locale={locale} current="demo" />
      <main id="main">
        <PageHero eyebrow={t("demo.eyebrow")} title={t("demo.title")} lead={t("demo.lead")} backdrop="grid">
          <Status locale={locale} />
        </PageHero>
        <Section title={t("demo.journeyTitle")} lead={t("demo.journeyLead")} spacing="sm">
          <Page size="wide">
            <CaptionedVideo
              webm={media.webm}
              mp4={media.mp4}
              poster={media.poster}
              label={t("demo.journeyLabel")}
              transcriptLabel={t("demo.transcript")}
              cues={CUES.loop.map((c) => ({ at: c.at, text: t(`demo.journey.cues.${c.id}`) }))}
            />
          </Page>
        </Section>
        <Section title={t("demo.noteTitle")} lead={t("demo.note")} spacing="sm" />
        <Section spacing="sm">
          <CtaPanel title={t("demo.nextTitle")} body={t("demo.nextText")}>
            <ButtonLink href={REPO_URL} variant="primary">
              {t("home.closingSource")}
            </ButtonLink>
          </CtaPanel>
        </Section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
