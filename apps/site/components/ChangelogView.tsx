import { ChangelogBody } from "@/components/ChangelogBody";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { CHANGELOG_REPO, loadReleases } from "@/lib/changelog";
import { getDictionary, type Locale, otherLocale } from "@/lib/i18n";
import { APP_UI_VERSION, APP_VERSION, changelogPath, pagePath } from "@/lib/site";

/** `/changelog/` and `/fr/changelog/` (changelog template): the weeks of merged work, read from GitHub at build. */
export async function ChangelogView({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  return (
    <>
      <SiteHeader locale={locale} current="home" switchHref={changelogPath(otherLocale(locale))} />
      <main id="main" className="pt-20">
        <ChangelogBody
          c={t.changelog}
          releases={await loadReleases()}
          version={APP_VERSION}
          ui={APP_UI_VERSION}
          back={{ href: pagePath(locale, "home"), label: t.meta.siteName }}
          feedHref={`${changelogPath(locale)}feed.xml`}
          pullsUrl={`https://github.com/${CHANGELOG_REPO}/pulls?q=is%3Apr+is%3Amerged`}
        />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
