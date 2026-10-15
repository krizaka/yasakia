import { describe, expect, it } from "vitest";

import { MAIL_TEMPLATES, renderMailTemplate } from "./mail-templates";
import { MAX_RESET_ATTEMPTS, RESET_CODE_TTL_MINUTES } from "./password-reset";

describe("password reset by e-mail code", () => {
  it("gives the code 10 minutes and 5 tries, like the sign-in code", () => {
    expect(RESET_CODE_TTL_MINUTES).toBe(10);
    expect(MAX_RESET_ATTEMPTS).toBe(5);
  });

  it("has an e-mail template with the code and its minutes, in English and French", () => {
    expect(MAIL_TEMPLATES["password-reset-code"]).toEqual({ code: "text", minutes: "text" });
    for (const locale of ["en", "fr"] as const) {
      const mail = renderMailTemplate("password-reset-code", { code: "482913", minutes: "10" }, { locale, appUrl: "https://dev.yasakia.com" });
      expect(mail.subject).toContain("482913");
      expect(mail.text).toContain("482913");
      expect(mail.text).toContain("10");
    }
  });
});
