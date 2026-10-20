import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "./audit";

const words = (locale: string) => JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")).console.admin.audit.actions as Record<string, unknown>;
const table = readFileSync(new URL("../components/console/AuditTable.tsx", import.meta.url), "utf8");

// The console crawl found « console.admin.audit.actions.auth.sign_in » printed in the audit log: the labels were flat keys with a dot
// in them (« auth.sign_in »), and a dotted message path reads nested objects.
describe("every audit action has a label the table can read", () => {
  it.each(["en", "fr"])("%s: nested by the action's own dots, for every action", (locale) => {
    for (const action of AUDIT_ACTIONS) {
      let node: unknown = words(locale);
      for (const part of action.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
      expect(typeof node, `${locale} ${action}`).toBe("string");
    }
  });

  it("the table lists every action in its filter and labels it", () => {
    for (const action of AUDIT_ACTIONS) expect(table, action).toContain(`"${action}"`);
  });
});
