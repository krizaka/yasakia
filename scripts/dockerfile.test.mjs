import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(new URL("../deploy/docker/Dockerfile", import.meta.url), "utf8");

// @ast-grep/cli's postinstall finds no linux-musl binary on node:alpine: the image installs without install scripts.
describe("the image build", () => {
  it("installs without running install scripts", () => {
    expect(dockerfile).toMatch(/(npm ci|pnpm install --frozen-lockfile)[^\n]*--ignore-scripts/);
  });
});

// App Platform hands a build-time variable to the Docker build only as a build argument: one the Dockerfile does not declare never
// reaches `next build` (the photos' CDN host stayed out of the CSP, so every photo was a broken image on dev).
describe("the build-time variables of the app spec", () => {
  const spec = readFileSync(new URL("../deploy/digitalocean/web.app.yaml", import.meta.url), "utf8");
  const keys = [...spec.matchAll(/key:\s*([A-Z0-9_]+),\s*scope:\s*(?:RUN_AND_BUILD_TIME|BUILD_TIME)/g)].map((m) => m[1]);
  it("finds them", () => expect(keys).toContain("MEDIA_CDN_HOSTNAME"));
  it.each(keys)("%s is a build argument of the image", (key) => {
    expect(dockerfile).toMatch(new RegExp(`^ARG ${key}$`, "m"));
  });
});
