import { Page } from "@krizaka/ui/page";

import { type Locale, translator } from "@/lib/i18n";
import { indexable } from "@/lib/indexing";

/**
 * A calm line under the footer of a deployment that is not open to the public (APP_SEARCH_INDEXING=off: dev, preview) — the
 * flag that keeps it out of search engines. A server component (the flag is read at build): tokens only, dark and light.
 */
export function DevEnvironmentNotice({ locale }: { locale: Locale }) {
  if (indexable()) return null;
  return (
    <Page>
      <p className="pb-6 text-center text-xs text-fg-muted" data-testid="dev-environment-notice">
        {translator(locale)("chrome.devNotice")}
      </p>
    </Page>
  );
}
