import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { PERSONA } from "@yasakia/ai";
import { intros } from "@yasakia/db";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

/**
 * Oussama's rule (2026-10-17): the AI never writes for the person. Every message of an introduction is typed by one of the
 * two people. These guards fail if a suggested line, a « reply for me » or a draft ever comes back — in the code, the
 * prompts, the words, the schema or the documented endpoints.
 */

const ROOT = path.resolve(import.meta.dirname, "../../..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (["node_modules", ".next", ".next-e2e", ".next-e2e-closed", "drizzle"].includes(name)) return [];
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx|mjs)$/.test(name) && !name.endsWith(".test.ts") ? [full] : [];
  });

const FORBIDDEN = /\b(opener|ghostwrit\w*|suggestReply|suggestedMessage|replyForMe|draftMessage|autoReply|writeForMe)\b/i;

describe("the AI never writes for the person", () => {
  it("no source of the app or the AI package names a suggested line, a draft or a reply-for-me", () => {
    const offenders = [...walk(path.join(ROOT, "apps/web/lib")), ...walk(path.join(ROOT, "apps/web/app")), ...walk(path.join(ROOT, "apps/web/components")), ...walk(path.join(ROOT, "packages/ai/src"))].filter((f) => FORBIDDEN.test(readFileSync(f, "utf8")) && !f.endsWith("no-ghostwriting.test.ts"));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("an introduction has no column for a line the AI wrote", () => {
    expect(Object.keys(getTableColumns(intros)).filter((c) => /opener|suggest|draft/i.test(c))).toEqual([]);
  });

  it("the agent is told, in every prompt, never to write a message for the person", () => {
    expect(PERSONA).toMatch(/NEVER write a message, a reply, a first line or a suggestion of what to say to another person/);
  });

  it("the words of the app promise it, and none offers a suggestion", () => {
    for (const lang of ["en", "fr"]) {
      const messages = JSON.parse(readFileSync(path.join(ROOT, `apps/web/messages/${lang}.json`), "utf8")).console.intros as Record<string, unknown>;
      expect(Object.keys(messages)).not.toContain("openerTitle");
      expect(JSON.stringify(messages)).not.toMatch(/suggest|suggèr|souffle|whisper/i);
      expect(typeof messages.typedByYou).toBe("string");
    }
  });

  it("no documented endpoint promises a suggested message", () => {
    const contracts = readFileSync(path.join(ROOT, "docs/API_CONTRACTS.md"), "utf8");
    expect(contracts).not.toMatch(/whisper|suggest|first line|opener/i);
  });

  it("the public site does not promise it either", () => {
    for (const lang of ["en", "fr"]) {
      const site = readFileSync(path.join(ROOT, `apps/site/messages/${lang}.json`), "utf8");
      expect(site).not.toMatch(/suggests to you|suggère|souffle|whispers/i);
    }
  });
});
