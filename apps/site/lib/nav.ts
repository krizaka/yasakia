import type { Locale } from "./i18n";
import { type PageId, PAGES } from "./site";

/**
 * The shape of the bar — the standard of the product sites (krizaka-ui, « Navigation des sites produits »): structure only,
 * the words are messages (`chrome.*`). Left: the brand, then at most four entries; a group is a menu, never a lone entry
 * that belongs to a group. Right: the repository, the theme, the language, « Sign in » (by invitation), and the one action.
 * An entry that has nothing behind it is absent, not dead: there is no Docs entry (Yasakia's docs live in its repository),
 * no Platforms menu (one platform; the mobile app is paused), no Pricing. Mobile takes the same groups in the same order.
 */
export interface NavGroup {
  id: "product";
  /** The pages the menu holds, in order; the first is the overview. */
  pages: readonly PageId[];
}

export const NAV_GROUPS: readonly NavGroup[] = [{ id: "product", pages: PAGES }];

/** The most entries the standard allows on the left, brand excluded. */
// @fixed: the product-site navigation standard (at most four entries on the left).
export const NAV_MAX_LEFT = 4;

/** The group a page belongs to (the menu that lights up on it). */
export const groupOf = (page: PageId): NavGroup["id"] | undefined => NAV_GROUPS.find((g) => g.pages.includes(page))?.id;

/** « Sign in » goes to the person's space — open to the people who test only (sign-up is closed). */
export const signInHref = (locale: Locale): string => `/app/${locale}/sign-in`;
