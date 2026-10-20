/**
 * The console's navigation, as data (docs/UX_DECISIONS.md « The console has five destinations, the operator's five sections »).
 * Structure only — the words are `console.shell.<label>` messages. A test holds its shape: at most 5 top-level entries for the
 * person and for the operator, every page in exactly one entry.
 */
export interface NavEntry {
  /** The message key under `console.shell`. */
  label: string;
  /** The entry's address under `/app/<locale>`; the empty string is the home. */
  href: string;
  /** Every page this entry holds (the entry is current on any of them); more than one gives the page a row of links to its siblings. */
  pages: readonly { label: string; href: string }[];
}

const single = (label: string, href: string): NavEntry => ({ label, href, pages: [{ label, href }] });

/** The person's destinations, in the order of the journey. The account is a utility, linked from the sidebar's footer. */
export const USER_NAV: readonly NavEntry[] = [single("dashboard", ""), single("talk", "/talk"), single("photos", "/photos"), single("batch", "/batch"), single("myIntros", "/intros")];

export const ACCOUNT_HREF = "/account";

/** The operator's sections: what needs a person's eyes first, then the settings, then the system. */
export const ADMIN_NAV: readonly NavEntry[] = [
  single("overview", "/admin"),
  {
    label: "users",
    href: "/admin/users",
    pages: [
      { label: "users", href: "/admin/users" },
      { label: "reports", href: "/admin/reports" },
    ],
  },
  single("intros", "/admin/intros"),
  single("rules", "/admin/rules"),
  {
    label: "system",
    href: "/admin/audit",
    pages: [
      { label: "audit", href: "/admin/audit" },
      { label: "health", href: "/admin/health" },
      { label: "analytics", href: "/admin/analytics" },
    ],
  },
];

/** The entry a path belongs to, and the page within it. */
export function currentEntry(entries: readonly NavEntry[], path: string, home: string): { entry: NavEntry; page: NavEntry["pages"][number] } | null {
  const rest = path.startsWith(home) ? path.slice(home.length) : path;
  let best: { entry: NavEntry; page: NavEntry["pages"][number] } | null = null;
  for (const entry of entries) {
    for (const page of entry.pages) {
      const hit = page.href === "" ? rest === "" || rest === "/" : rest === page.href || rest.startsWith(`${page.href}/`);
      if (hit && (!best || page.href.length > best.page.href.length)) best = { entry, page };
    }
  }
  return best;
}
