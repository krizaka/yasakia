import { describe, expect, it } from "vitest";

import { qaResetRefusal } from "./qa-reset";

describe("qaResetRefusal", () => {
  it("allows a QA address, in development or on a dev deployment", () => {
    expect(qaResetRefusal("qa+user@yasakia.com", {})).toBeNull();
    expect(qaResetRefusal(" QA+User@Yasakia.com ", { NODE_ENV: "production", NEXT_PUBLIC_APP_ENV: "dev" })).toBeNull();
  });
  it("never resets a real person", () => {
    expect(qaResetRefusal("camille@example.com", {})).toMatch(/not a QA address/);
    expect(qaResetRefusal("qa@yasakia.com", {})).toMatch(/not a QA address/);
    expect(qaResetRefusal("someone+qa+x@gmail.com", {})).toMatch(/not a QA address/);
  });
  it("never touches production", () => {
    expect(qaResetRefusal("qa+user@yasakia.com", { NODE_ENV: "production" })).toMatch(/production/);
    expect(qaResetRefusal("qa+user@yasakia.com", { NODE_ENV: "production", NEXT_PUBLIC_APP_ENV: "production" })).toMatch(/production/);
  });
});
