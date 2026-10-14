import { YasakiaLogo } from "@krizaka/ui";
import { CtaPanel } from "@krizaka/ui/cta-panel";
import { HowItWorksPage } from "@krizaka/ui/how-it-works-page";
import { LandingPage } from "@krizaka/ui/landing-page";
import { Page, Section } from "@krizaka/ui/page";
import { PageHero } from "@krizaka/ui/page-hero";
import Link from "next/link";

import { type Locale, translator } from "@/lib/i18n";
import { clip } from "@/lib/media";
import { contactHref, pagePath, REPO_URL } from "@/lib/site";

import { ButtonLink } from "./ButtonLink";
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
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

/** How it works: the four steps of the loop, privacy by design, what it is built on. */
export function HowView({ locale }: { locale: Locale }) {
  const t = translator(locale);
  const steps = ["talk", "batch", "both", "debrief"] as const;
  const privacy = ["position", "photos", "encrypted", "control", "honest"] as const;
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

/** The demo: the one recording that exists, read honestly. Media come from the CDN only. */
export function DemoView({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <>
      <SiteHeader locale={locale} current="demo" />
      <main id="main">
        <PageHero eyebrow={t("demo.eyebrow")} title={t("demo.title")} lead={t("demo.lead")} backdrop="grid">
          <Status locale={locale} />
        </PageHero>
        <Section>
          <Page size="narrow">
            {(["dark", "light"] as const).map((theme) => {
              const media = clip(theme);
              return (
                // The theme's own recording: the other is hidden by the active theme (html.light) in globals.css.
                <video key={theme} className={theme === "dark" ? "yz-demo-dark mx-auto w-full max-w-xs rounded-2xl border border-border-default" : "yz-demo-light mx-auto w-full max-w-xs rounded-2xl border border-border-default"} poster={media.poster} controls playsInline muted loop preload="none" aria-label={t("demo.videoLabel")}>
                  <source src={media.webm} type="video/webm" />
                  <source src={media.mp4} type="video/mp4" />
                </video>
              );
            })}
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
