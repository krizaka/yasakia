import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const spec = readFileSync(join(__dirname, "../../../deploy/digitalocean/web.app.yaml"), "utf8");

describe("www.yasakia.com is indexed (krizaka-com AGENTS §2.4); dev. and admin. are not", () => {
  it("the web app spec leaves APP_SEARCH_INDEXING on, so robots allows, the sitemap exists and no noindex is sent", () => {
    const line = spec.split("\n").find((l) => !l.trim().startsWith("#") && l.includes("APP_SEARCH_INDEXING"));
    expect(line, "APP_SEARCH_INDEXING is declared").toBeDefined();
    expect(line).toMatch(/value:\s*"on"/);
  });

  it("the public address is www; dev is APP_DEV_HOST (pages 308 to www, the API stays); the apex answers 308 with www", () => {
    expect(spec).toMatch(/- domain: www\.yasakia\.com\n\s+type: PRIMARY/);
    expect(spec).toMatch(/- domain: yasakia\.com\n\s+type: ALIAS/);
    expect(spec).toMatch(/- domain: dev\.yasakia\.com\n\s+type: ALIAS/);
    expect(spec).toMatch(/key: NEXT_PUBLIC_APP_URL, scope: RUN_AND_BUILD_TIME, value: "https:\/\/www\.yasakia\.com"/);
    expect(spec).toMatch(/key: APP_DEV_HOST, scope: RUN_TIME, value: dev\.yasakia\.com/);
    const ingress = spec.slice(spec.indexOf("ingress:"));
    expect(ingress).toMatch(/exact: yasakia\.com[\s\S]*authority: www\.yasakia\.com[\s\S]*redirect_code: 308/);
  });
});
