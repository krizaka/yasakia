import { describe, expect, it } from "vitest";

// next.config.mjs maps every landing address to its file — checked from the config itself.
const config = (await import("../next.config.mjs")).default as { rewrites: () => Promise<{ beforeFiles: { source: string; destination: string }[] }>; skipTrailingSlashRedirect?: boolean };

describe("landing rewrites", () => {
  it("maps each page, with and without a trailing slash, to its exported file", async () => {
    const { beforeFiles } = await config.rewrites();
    const map = Object.fromEntries(beforeFiles.map((r) => [r.source, r.destination]));
    expect(map["/"]).toBe("/index.html");
    for (const page of ["how-it-works", "demo", "fr", "fr/how-it-works", "fr/demo"]) {
      expect(map[`/${page}`], page).toBe(`/${page}/index.html`);
      expect(map[`/${page}/`], page).toBe(`/${page}/index.html`);
    }
  });
  it("keeps the export's trailing-slash addresses (canonical URLs) instead of redirecting them", () => {
    expect(config.skipTrailingSlashRedirect).toBe(true);
  });
});
