import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const shell = readFileSync(new URL("../components/console/ConsoleShell.tsx", import.meta.url), "utf8");
const messages = (locale: string) => JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));

// The console crawl (scripts/check-console.mjs, run in CI and on dev) found the operator console's header 14 to 58 px wider than a
// 390 px phone: « DEV · version » and a labelled « Sign out » side by side. On a phone the badge is short and the button is an icon.
describe("the console header fits a phone", () => {
  it("shows the short DEV badge under sm and the version badge from sm up", () => {
    expect(shell).toContain('className="hidden sm:inline-flex"');
    expect(shell).toContain('className="sm:hidden"');
    for (const locale of ["en", "fr"]) expect(messages(locale).console.shell.devShort).toBeTruthy();
  });
  it("keeps the sign-out button's name for assistive technology when only its icon shows", () => {
    expect(shell).toContain('className="max-sm:sr-only"');
  });

  it("words the page title through the shell messages (a bare label rendered « console.photos »)", () => {
    expect(shell).toContain("title={say(`shell.${titleKey}`)}");
  });
});
