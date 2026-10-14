import { YasakiaLogo } from "@krizaka/ui";
import { Page } from "@krizaka/ui/page";
import { ThemeToggle } from "@krizaka/ui/theme";
import Link from "next/link";

import { type Locale, otherLocale, translator } from "@/lib/i18n";
import { APP_VERSION, contactHref, KRIZAKA_URL, type PageId, pagePath, PAGES, REPO_URL } from "@/lib/site";

import { Rich } from "./Rich";

const navLink =
  "rounded-md px-2 py-1 text-sm text-fg-secondary transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:text-fg-accent aria-[current=page]:font-semibold";

/** The bar: the animated mark, the three pages, the other language (the same page), the theme. */
export function SiteHeader({ locale, current }: { locale: Locale; current: PageId }) {
  const t = translator(locale);
  const other = otherLocale(locale);
  return (
    <header className="sticky top-0 z-30 border-b border-border-default bg-surface-0/80 backdrop-blur-md">
      <Page className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 py-3">
        <Link href={pagePath(locale, "home")} aria-label={t("chrome.brandHome")} className="inline-flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <YasakiaLogo size={30} />
          <span className="font-display text-lg font-bold tracking-tight text-fg">Yasakia</span>
        </Link>
        <nav aria-label={t("chrome.navLabel")} className="order-3 flex w-full flex-wrap gap-1 sm:order-none sm:ml-6 sm:w-auto">
          {PAGES.map((page) => (
            <Link key={page} href={pagePath(locale, page)} aria-current={page === current ? "page" : undefined} className={navLink}>
              {t(`chrome.nav.${page}`)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href={pagePath(other, current)} hrefLang={other} lang={other} className={navLink}>
            <span className="sr-only">{t("chrome.languageLabel")} · </span>
            {t("chrome.otherLanguage")}
          </Link>
          <ThemeToggle label={t("chrome.themeToggle")} variant="ghost" />
        </div>
      </Page>
    </header>
  );
}

/** The footer: « A Krizaka product » back to krizaka.com, the source, the version of this build. */
export function SiteFooter({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <footer className="mt-16 border-t border-border-default">
      <Page className="flex flex-col gap-3 py-8 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          <Rich text={t("chrome.footer")} />
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a href={KRIZAKA_URL} className="font-semibold text-fg-secondary underline-offset-4 hover:text-fg hover:underline">
            {t("chrome.product")}
          </a>
          <a href={REPO_URL} className="underline-offset-4 hover:text-fg hover:underline">
            {t("chrome.sourceCode")}
          </a>
          <a href={contactHref("dev-yasakia")} className="underline-offset-4 hover:text-fg hover:underline">
            {t("chrome.contact")}
          </a>
          <span className="font-mono text-xs" data-testid="app-version">
            {t("chrome.version")} {APP_VERSION}
          </span>
        </div>
      </Page>
    </footer>
  );
}
