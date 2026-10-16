import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(new URL("../deploy/docker/Dockerfile", import.meta.url), "utf8");

// @ast-grep/cli's postinstall finds no linux-musl binary on node:alpine: the image installs without install scripts.
describe("the image build", () => {
  it("installs without running install scripts", () => {
    expect(dockerfile).toMatch(/(npm ci|pnpm install --frozen-lockfile)[^\n]*--ignore-scripts/);
  });
});
