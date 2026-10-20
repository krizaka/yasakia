"use client";

import { HomeIcon, InfoIcon, PlayIcon } from "@krizaka/icons";
import { YasakiaLogo } from "@krizaka/ui";
import { Button } from "@krizaka/ui/button";
import { languagesFor } from "@krizaka/ui/language-switch";
import { NavBar } from "@krizaka/ui/nav-bar";
import { SiteFooter as FamilyFooter } from "@krizaka/ui/site-footer";
import { familyLabels } from "@krizaka/ui/sites";
import { ThemeToggle } from "@krizaka/ui/theme";
import Link from "next/link";

import { format, getDictionary, type Locale, translator } from "@/lib/i18n";
import { indexable } from "@/lib/indexing";
import { groupOf, NAV_GROUPS, signInHref } from "@/lib/nav";
import { APP_UI_VERSION, APP_VERSION, changelogPath, contactHref, type PageId, pagePath, PAGES, REPO_URL } from "@/lib/site";

/** The footer lists every page; the bar groups them (lib/nav.ts). */
const SECTIONS = PAGES.filter((p) => p !== "home");

const ICONS = { home: <HomeIcon />, "how-it-works": <InfoIcon />, demo: <PlayIcon /> } as const;

/** The bar: the animated mark, the DEV badge · the sections of this site · the repository, the theme, the language and
    the one action. No family switcher: a deployed product is independent. Below md, one panel. */
export function SiteHeader({ locale, current, path }: { locale: Locale; current: PageId; path?: string }) {
  const t = translator(locale);
  const languages = languagesFor(path ?? pagePath(locale, current));
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 px-3">
      <NavBar.Root label={t("chrome.navLabel")} className="pointer-events-auto mx-auto max-w-(--kz-page-max,72rem)">
        <NavBar.Brand asChild>
          <Link href={pagePath(locale, "home")} aria-label={t("chrome.brandHome")}>
            <YasakiaLogo size={26} />
            Yasakia
          </Link>
        </NavBar.Brand>
        <NavBar.Items>
          {NAV_GROUPS.map((group) => (
            <NavBar.Menu key={group.id} value={group.id} label={t(`chrome.nav.${group.id}`)} active={groupOf(current) === group.id} columns={1}>
              {group.pages.map((page) => (
                <NavBar.MenuLink key={page} asChild icon={ICONS[page]} title={t(`chrome.menu_product.${page}.title`)} description={t(`chrome.menu_product.${page}.text`)} active={page === current}>
                  <Link href={pagePath(locale, page)} />
                </NavBar.MenuLink>
              ))}
            </NavBar.Menu>
          ))}
        </NavBar.Items>

        <NavBar.Actions className="gap-1">
          <NavBar.Repo href={REPO_URL} label={t("chrome.sourceCode")} className="hidden lg:inline-flex" />
          <span className="hidden md:inline-flex">
            <ThemeToggle label={t("chrome.themeToggle")} variant="ghost" />
          </span>
          <span className="hidden md:inline-flex">
            <NavBar.Language label={t("chrome.languageLabel")} current={locale} languages={languages} linkAs={Link} />
          </span>
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
            <a href={signInHref(locale)}>{t("chrome.signIn")}</a>
          </Button>
          <Button asChild variant="primary" size="sm" className="ml-1 hidden font-bold md:inline-flex">
            <a href={contactHref("dev-yasakia-bar")}>{t("chrome.contact")}</a>
          </Button>

          <NavBar.Mobile openLabel={t("chrome.menu")} closeLabel={t("chrome.menu")} className="max-h-[calc(100dvh-6rem)] gap-1 overflow-y-auto overscroll-contain p-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.id} role="group" aria-label={t(`chrome.nav.${group.id}`)} className="flex flex-col gap-1">
                <p className="px-3 pt-1 text-xs font-semibold uppercase tracking-wider text-fg-muted">{t(`chrome.nav.${group.id}`)}</p>
                {group.pages.map((page) => (
                  <NavBar.MobileLink key={page} asChild active={page === current}>
                    <Link href={pagePath(locale, page)}>{t(`chrome.menu_product.${page}.title`)}</Link>
                  </NavBar.MobileLink>
                ))}
              </div>
            ))}
            <NavBar.MobileLink asChild>
              <a href={signInHref(locale)}>{t("chrome.signIn")}</a>
            </NavBar.MobileLink>
            <NavBar.MobilePreferences label={t("chrome.preferences")}>
              <ThemeToggle label={t("chrome.themeToggle")} variant="ghost" />
              <NavBar.Language label={t("chrome.languageLabel")} current={locale} languages={languages} linkAs={Link} />
            </NavBar.MobilePreferences>
            <Button asChild variant="primary" size="md" className="mt-2 font-bold">
              <a href={contactHref("dev-yasakia-bar")}>{t("chrome.contact")}</a>
            </Button>
              </NavBar.Mobile>
        </NavBar.Actions>
      </NavBar.Root>
    </div>
  );
}

/** The footer: this site's own column, the publisher line « A Krizaka product » (no family columns), DEV · the version, Montréal. */
export function SiteFooter({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <FamilyFooter current="yasakia" family={false} labels={familyLabels[locale]} aria-label={t("chrome.footerLabel")} env="dev" data-testid="app-version" legal={<>
      <FamilyFooter.Link asChild>
        <Link href={`${changelogPath(locale)}#${APP_VERSION}`}>{format(getDictionary(locale).changelog.footerVersion, { version: APP_VERSION })}{APP_UI_VERSION ? ` · Krizaka UI ${APP_UI_VERSION}` : ""}</Link>
      </FamilyFooter.Link>
      {indexable() ? null : <span data-testid="dev-environment-notice">{t("chrome.devNotice")}</span>}
    </>}>
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
