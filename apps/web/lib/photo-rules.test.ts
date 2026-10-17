import { describe, expect, it } from "vitest";

import { describeCheck, type PhotoRow, photoCodeIsBlocking, type StoredCheck } from "./photo-rules";

const rules = { minPhotos: 4, maxPhotos: 6, minFacePhotos: 2 };
const photo = (n: number): PhotoRow => ({ id: `p${n}`, position: n });
const photos = [0, 1, 2, 3].map(photo);
const report = (over: Record<string, unknown> = {}) => ({
  photos: [
    { index: 0, kind: "FACE", faceCount: 1, findings: [] },
    { index: 1, kind: "FACE", faceCount: 1, findings: [] },
    { index: 2, kind: "NO_FACE", faceCount: 0, findings: [] },
    { index: 3, kind: "NO_FACE", faceCount: 0, findings: [{ code: "UNVERIFIED", severity: "INFO" }] },
  ],
  counts: { photos: 4, facePhotos: 2 },
  blockers: [],
  passes: true,
  ...over,
});
const done = (over: Partial<StoredCheck> = {}): StoredCheck => ({ status: "DONE", setHash: "h1", photoIds: ["p0", "p1", "p2", "p3"], passes: true, report: report(), errorCode: null, ...over });

describe("describeCheck", () => {
  it("an account with no photo is EMPTY and nothing is asked of the engine", () => {
    const view = describeCheck({ rules, photos: [], currentHash: "", latest: null });
    expect(view).toMatchObject({ state: "EMPTY", verified: false, counts: { photos: 0, facePhotos: 0 } });
    expect(view.needsCheck).toBe(false);
  });

  it("photos never checked need a check", () => {
    const view = describeCheck({ rules, photos, currentHash: "h1", latest: null });
    expect(view).toMatchObject({ state: "UNCHECKED", verified: false, needsCheck: true });
    expect(view.photos.map((p) => p.check)).toEqual(["PENDING", "PENDING", "PENDING", "PENDING"]);
  });

  it("a passing check of exactly this set is PASSED and verified, with each photo's kind", () => {
    const view = describeCheck({ rules, photos, currentHash: "h1", latest: done() });
    expect(view).toMatchObject({ state: "PASSED", verified: true, needsCheck: false, counts: { photos: 4, facePhotos: 2 } });
    expect(view.photos.map((p) => p.check)).toEqual(["FACE", "FACE", "NO_FACE", "NO_FACE"]);
    expect(view.photos[3].findings).toEqual(["UNVERIFIED"]);
  });

  it("a failing check names the blockers by photo id — codes, never a number", () => {
    const failing = done({ passes: false, report: report({ passes: false, blockers: [{ code: "FACE_MISMATCH", photos: [1] }, { code: "TOO_FEW_FACE_PHOTOS", photos: [] }] }) });
    const view = describeCheck({ rules, photos, currentHash: "h1", latest: failing });
    expect(view).toMatchObject({ state: "FAILED", verified: false });
    expect(view.blockers).toEqual([{ code: "FACE_MISMATCH", photos: ["p1"] }, { code: "TOO_FEW_FACE_PHOTOS", photos: [] }]);
    expect(JSON.stringify(view)).not.toMatch(/score|similar|cosine|embedding/i);
  });

  it("a check of another set is stale: the verdict is not carried over, and the photos are checked again", () => {
    const view = describeCheck({ rules, photos, currentHash: "h2", latest: done() });
    expect(view).toMatchObject({ state: "UNCHECKED", verified: false, needsCheck: true });
  });

  it("a photo added after the check shows as pending while the others keep what was found", () => {
    const view = describeCheck({ rules, photos: [...photos, photo(4)], currentHash: "h2", latest: done() });
    expect(view.photos.map((p) => p.check)).toEqual(["FACE", "FACE", "NO_FACE", "NO_FACE", "PENDING"]);
  });

  it("a check in progress is CHECKING, whatever came before", () => {
    const view = describeCheck({ rules, photos, currentHash: "h1", latest: { ...done(), status: "RUNNING", passes: null, report: null } });
    expect(view).toMatchObject({ state: "CHECKING", verified: false, needsCheck: false });
  });

  it("an engine that was out of reach is UNAVAILABLE for this set (try again), UNCHECKED for another", () => {
    const err = done({ status: "ERROR", passes: null, report: null, errorCode: "unreachable" });
    expect(describeCheck({ rules, photos, currentHash: "h1", latest: err })).toMatchObject({ state: "UNAVAILABLE", needsCheck: false });
    expect(describeCheck({ rules, photos, currentHash: "h9", latest: err })).toMatchObject({ state: "UNCHECKED", needsCheck: true });
  });

  it("a report that does not fit the stored photo list is not trusted", () => {
    const odd = done({ report: report({ photos: [{ index: 9, kind: "FACE", faceCount: 1, findings: [] }] }) });
    expect(describeCheck({ rules, photos, currentHash: "h1", latest: odd }).state).toBe("UNCHECKED");
  });

  it("the rules are echoed so the screen can say « 3/4 »", () => {
    expect(describeCheck({ rules, photos, currentHash: "h1", latest: null }).rules).toEqual(rules);
  });
});

describe("photoCodeIsBlocking", () => {
  it("UNVERIFIED and GROUP_PHOTO are information; the rest stop the set", () => {
    expect(photoCodeIsBlocking("UNVERIFIED")).toBe(false);
    expect(photoCodeIsBlocking("GROUP_PHOTO")).toBe(false);
    for (const code of ["FACE_MISMATCH", "MINOR_LIKELY", "TEXT_OR_CONTACT", "SCREENSHOT", "TOO_FEW_PHOTOS", "TOO_FEW_FACE_PHOTOS", "TOO_MANY_PHOTOS"] as const) expect(photoCodeIsBlocking(code)).toBe(true);
  });
});
