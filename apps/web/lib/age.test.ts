import { describe, expect, it } from "vitest";

import { ageOn, checkBirthDate } from "./age";

const TODAY = new Date(Date.UTC(2026, 9, 11));

describe("18+, checked by the server", () => {
  it("counts whole years, the birthday included", () => {
    expect(ageOn("2008-10-11", TODAY)).toBe(18);
    expect(ageOn("2008-10-12", TODAY)).toBe(17);
    expect(ageOn("1990-02-28", TODAY)).toBe(36);
  });

  it("accepts an adult, refuses a minor (by one day)", () => {
    expect(checkBirthDate("2008-10-11", TODAY)).toEqual({ ok: true, age: 18 });
    expect(checkBirthDate("2008-10-12", TODAY)).toEqual({ ok: false, code: "UNDERAGE" });
  });

  it("refuses dates that do not exist, the future, and over 120 years", () => {
    for (const date of ["1990-02-30", "1990-13-01", "90-01-01", "", "2027-01-01", "1890-01-01", "1990-1-1"]) {
      expect(checkBirthDate(date, TODAY)).toEqual({ ok: false, code: "BIRTH_DATE_INVALID" });
    }
  });
});
