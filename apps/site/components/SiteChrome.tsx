"use client";

import { YasakiaLogo } from "@krizaka/ui";
import { Button } from "@krizaka/ui/button";
import { NavBar } from "@krizaka/ui/nav-bar";
import { SiteFooter as FamilyFooter } from "@krizaka/ui/site-footer";
import { familyLabels } from "@krizaka/ui/sites";
import { ThemeToggle } from "@krizaka/ui/theme";
import Link from "next/link";

import { type Locale, otherLocale, translator } from "@/lib/i18n";
import { APP_VERSION, contactHref, type PageId, pagePath, PAGES, REPO_URL } from "@/lib/site";

/** This site's sections in the bar's centre (the home is the brand). */
const SECTIONS = PAGES.filter((p) => p !== "home");

/** The bar (NAV-SYS): the animated mark, the family, the DEV badge · the sections of this site · the repository, the
    theme, the language and the one action. Below md, one panel and the family as its last group. */
export function SiteHeader({ locale, current }: { locale: Locale; current: PageId }) {
  const t = translator(locale);
  const other = otherLocale(locale);
  const family = <NavBar.Family current="yasakia" labels={familyLabels[locale]} />;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 px-3">
      <NavBar.Root label={t("chrome.navLabel")} className="pointer-events-auto mx-auto max-w-(--kz-page-max,72rem)">
        <NavBar.Brand asChild>
          <Link href={pagePath(locale, "home")} aria-label={t("chrome.brandHome")}>
            <YasakiaLogo size={26} />
            Yasakia
          </Link>
        </NavBar.Brand>
        {family}
        <NavBar.Badge env="dev" version={APP_VERSION} />

        <NavBar.Items>
          {SECTIONS.map((page) => (
            <NavBar.Link key={page} asChild active={page === current}>
              <Link href={pagePath(locale, page)}>{t(`chrome.nav.${page}`)}</Link>
            </NavBar.Link>
          ))}
        </NavBar.Items>

        <NavBar.Actions className="gap-1">
          <NavBar.Repo href={REPO_URL} label={t("chrome.sourceCode")} className="hidden lg:inline-flex" />
          <span className="hidden md:inline-flex">
            <ThemeToggle label={t("chrome.themeToggle")} variant="ghost" />
          </span>
          <Button asChild variant="outline" size="sm" className="hidden h-7 w-auto px-2 font-mono text-[11px] font-semibold tracking-wide md:inline-flex">
            <Link href={pagePath(other, current)} hrefLang={other} lang={other}>
              <span className="sr-only">{t("chrome.languageLabel")} · </span>
              {t("chrome.otherLanguage")}
            </Link>
          </Button>
          <Button asChild variant="primary" size="sm" shape="cut" className="ml-1 hidden font-bold md:inline-flex">
            <a href={contactHref("dev-yasakia-bar")}>{t("chrome.contact")}</a>
          </Button>

          <NavBar.Mobile openLabel={t("chrome.menu")} closeLabel={t("chrome.menu")} className="max-h-[calc(100dvh-6rem)] gap-1 overflow-y-auto overscroll-contain p-3">
            {SECTIONS.map((page) => (
              <NavBar.MobileLink key={page} asChild active={page === current}>
                <Link href={pagePath(locale, page)}>{t(`chrome.nav.${page}`)}</Link>
              </NavBar.MobileLink>
            ))}
            <NavBar.MobileLink asChild>
              <Link href={pagePath(other, current)} hrefLang={other} lang={other}>
                {t("chrome.otherLanguage")}
              </Link>
            </NavBar.MobileLink>
            <div className="flex items-center gap-2 px-3 py-1">
              <ThemeToggle label={t("chrome.themeToggle")} variant="ghost" />
            </div>
            <Button asChild variant="primary" size="md" shape="cut" className="mt-2 font-bold">
              <a href={contactHref("dev-yasakia-bar")}>{t("chrome.contact")}</a>
            </Button>
            {family}
          </NavBar.Mobile>
        </NavBar.Actions>
      </NavBar.Root>
    </div>
  );
}

/** The footer (NAV-SYS): this site's own column, the family in columns, « A Krizaka product », DEV · the version, Montréal. */
export function SiteFooter({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <FamilyFooter current="yasakia" labels={familyLabels[locale]} aria-label={t("chrome.footerLabel")} version={APP_VERSION} env="dev" data-testid="app-version">
      <FamilyFooter.Column title="Yasakia">
        {SECTIONS.map((page) => (
          <FamilyFooter.Link key={page} asChild>
            <Link href={pagePath(locale, page)}>{t(`chrome.nav.${page}`)}</Link>
          </FamilyFooter.Link>
        ))}
        <FamilyFooter.Link href={REPO_URL}>{t("chrome.sourceCode")}</FamilyFooter.Link>
        <FamilyFooter.Link href={contactHref("dev-yasakia")}>{t("chrome.contact")}</FamilyFooter.Link>
      </FamilyFooter.Column>
    </FamilyFooter>
  );
}
