import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// One footer, one contentinfo: @krizaka/ui's SiteFooter in product mode, rendered once per legal page after its content.
const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(ROOT, rel)).isDirectory() ? files(rel) : [rel];
  });
}

describe("the web pages render exactly one footer", () => {
  it("the footer is the family's SiteFooter without family columns — the hand-made one is gone", () => {
    const chrome = read("components/SiteChrome.tsx");
    expect(chrome).toContain('from "@krizaka/ui/site-footer"');
    expect(chrome).toContain("family={false}");
    expect(chrome).not.toMatch(/<footer\b/);
  });

  it("each page renders <SiteFooter/> once and nothing else renders a footer", () => {
    for (const page of ["privacy", "terms", "delete-account"]) {
      const source = read(`app/[locale]/${page}/page.tsx`);
      expect(source.match(/<SiteFooter\b/g)).toHaveLength(1);
    }
    const offenders = [...files("app"), ...files("components")]
      .filter((f) => /\.tsx$/.test(f) && !/SiteChrome\.tsx$/.test(f))
      .filter((f) => /<footer\b|<FamilyFooter\b/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});
