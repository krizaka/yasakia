import { YasakiaLogo } from "@krizaka/ui";
import { Page } from "@krizaka/ui/page";
import { SiteFooter as FamilyFooter } from "@krizaka/ui/site-footer";
import { familyLabels } from "@krizaka/ui/sites";
import { ThemeToggle } from "@krizaka/ui/theme";
import Link from "next/link";

import { type Locale, otherLocale, translator } from "@/lib/i18n";
import { indexable } from "@/lib/indexing";
import { contactHref, LEGAL_PAGES, LEGAL_PATHS, type LegalPage, PRODUCT_URL, REPO_URL } from "@/lib/site";

const navLink =
  "rounded-md px-2 py-1 text-sm text-fg-secondary transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:text-fg-accent aria-[current=page]:font-semibold";

/**
 * The frame of the three web pages: the animated mark (to krizaka.com's Yasakia page), the three pages, the other
 * language (the same page) and the theme; a footer that says who makes Yasakia.
 */
export function SiteHeader({ locale, current }: { locale: Locale; current?: LegalPage }) {
  const t = translator(locale);
  const other = otherLocale(locale);
  const otherPath = `/${other}${current ? `/${LEGAL_PATHS[current]}` : ""}`;
  return (
    <header className="border-b border-border-default bg-surface-0/80 backdrop-blur-md">
      <Page className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 py-3">
        <a href={PRODUCT_URL} aria-label={t("chrome.brandHome")} className="inline-flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <YasakiaLogo size={30} />
          <span className="font-display text-lg font-bold tracking-tight text-fg">Yasakia</span>
        </a>
        <nav aria-label={t("chrome.navLabel")} className="order-3 flex w-full flex-wrap gap-1 sm:order-none sm:ml-6 sm:w-auto">
          {LEGAL_PAGES.map((page) => (
            <Link key={page} href={`/${locale}/${LEGAL_PATHS[page]}`} aria-current={page === current ? "page" : undefined} className={navLink}>
              {t(`chrome.nav.${page}`)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href={otherPath} hrefLang={other} lang={other} className={navLink}>
            <span className="sr-only">{t("chrome.languageLabel")} · </span>
            {t("chrome.otherLanguage")}
          </Link>
          <ThemeToggle label={t("chrome.themeToggle")} variant="ghost" />
        </div>
      </Page>
    </header>
  );
}

/**
 * The footer is @krizaka/ui's SiteFooter in product mode (`family={false}`): the three legal pages and the repository, the
 * publisher line « A Krizaka product » (→ www.krizaka.com), DEV · the version, Montréal. On a deployment kept out of search
 * engines the invitation line ends the signature row (one footer, no strip under it).
 */
export function SiteFooter({ locale, source }: { locale: Locale; source: string }) {
  const t = translator(locale);
  return (
    <FamilyFooter
      current="yasakia"
      family={false}
      labels={familyLabels[locale]}
      aria-label={t("chrome.footerLabel")}
      version={process.env.APP_VERSION || undefined}
      env={indexable() ? undefined : "dev"}
      data-testid="app-version"
      legal={indexable() ? undefined : <span data-testid="dev-environment-notice">{t("chrome.devNotice")}</span>}
    >
      <FamilyFooter.Column title="Yasakia">
        {LEGAL_PAGES.map((page) => (
          <FamilyFooter.Link key={page} asChild>
            <Link href={`/${locale}/${LEGAL_PATHS[page]}`}>{t(`chrome.nav.${page}`)}</Link>
          </FamilyFooter.Link>
        ))}
        <FamilyFooter.Link href={REPO_URL}>{t("chrome.sourceCode")}</FamilyFooter.Link>
        <FamilyFooter.Link href={contactHref(source)}>{t("chrome.contact")}</FamilyFooter.Link>
      </FamilyFooter.Column>
    </FamilyFooter>
  );
}
