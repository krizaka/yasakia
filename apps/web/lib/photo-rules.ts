import type { PhotoCode } from "@yasakia/ai";

/**
 * What the person sees of their photo set, pure: the latest check of Orazaka's `profile-photo-check` Studio read against
 * the photos they have **now**. A verdict belongs to one set (its `set_hash`); any other set is unchecked. Everything
 * here is codes and photo ids — the screen words them, and nothing carries a score.
 */

export interface PhotoRules {
  minPhotos: number;
  maxPhotos: number;
  minFacePhotos: number;
}

export interface PhotoRow {
  id: string;
  position: number;
}
export type PhotoRows = PhotoRow[];

export interface StoredCheck {
  status: "QUEUED" | "RUNNING" | "DONE" | "ERROR";
  setHash: string;
  /** The photos checked, in the order they were sent: the report's `index` is a position in this list. */
  photoIds: string[];
  passes: boolean | null;
  report: unknown;
  errorCode: string | null;
}

export type CheckState = "EMPTY" | "UNCHECKED" | "CHECKING" | "PASSED" | "FAILED" | "UNAVAILABLE";
export type PhotoCheckKind = "PENDING" | "FACE" | "GROUP" | "NO_FACE";

export interface PhotoCheckView {
  state: CheckState;
  /** The set passed Orazaka's check — the photos can be shown, a batch can open. */
  verified: boolean;
  /** The set has no verdict (never checked, or changed since): the client asks for one. */
  needsCheck: boolean;
  rules: PhotoRules;
  counts: { photos: number; facePhotos: number };
  photos: { id: string; check: PhotoCheckKind; faceCount: number; findings: PhotoCode[] }[];
  blockers: { code: PhotoCode; photos: string[] }[];
}

interface ReportPhoto {
  index: number;
  kind: "FACE" | "GROUP" | "NO_FACE";
  faceCount: number;
  findings: { code: PhotoCode }[];
}
interface Report {
  photos: ReportPhoto[];
  counts: { photos: number; facePhotos: number };
  blockers: { code: PhotoCode; photos: number[] }[];
}

const INFORMATION: readonly PhotoCode[] = ["UNVERIFIED", "GROUP_PHOTO"];

/** Whether a code stops the set (the others are said to the person without stopping them). */
export const photoCodeIsBlocking = (code: PhotoCode): boolean => !INFORMATION.includes(code);

/** The report as the table holds it, or null when it is not one this set can be read against. */
function readReport(stored: StoredCheck): Report | null {
  const r = stored.report as Report | null;
  if (!r || !Array.isArray(r.photos) || !Array.isArray(r.blockers) || !r.counts) return null;
  if (r.photos.length !== stored.photoIds.length || r.photos.some((p) => !Number.isInteger(p.index) || p.index < 0 || p.index >= stored.photoIds.length)) return null;
  return r;
}

export function describeCheck(input: { rules: PhotoRules; photos: PhotoRow[]; currentHash: string; latest: StoredCheck | null }): PhotoCheckView {
  const { rules, photos, currentHash, latest } = input;
  const ordered = [...photos].sort((a, b) => a.position - b.position);
  const base = { rules, counts: { photos: ordered.length, facePhotos: 0 }, blockers: [] as PhotoCheckView["blockers"] };
  const pending = ordered.map((p) => ({ id: p.id, check: "PENDING" as const, faceCount: 0, findings: [] as PhotoCode[] }));
  if (ordered.length === 0) return { ...base, state: "EMPTY", verified: false, needsCheck: false, photos: [] };
  if (!latest) return { ...base, state: "UNCHECKED", verified: false, needsCheck: true, photos: pending };
  if (latest.status === "QUEUED" || latest.status === "RUNNING") return { ...base, state: "CHECKING", verified: false, needsCheck: false, photos: carry(ordered, latest) };

  const sameSet = latest.setHash === currentHash;
  if (latest.status === "ERROR") {
    return sameSet ? { ...base, state: "UNAVAILABLE", verified: false, needsCheck: false, photos: pending } : { ...base, state: "UNCHECKED", verified: false, needsCheck: true, photos: carry(ordered, latest) };
  }
  const report = readReport(latest);
  if (!report) return { ...base, state: "UNCHECKED", verified: false, needsCheck: true, photos: pending };
  const photosView = carry(ordered, latest, report);
  if (!sameSet) return { ...base, state: "UNCHECKED", verified: false, needsCheck: true, photos: photosView };
  const passed = latest.passes === true;
  return {
    state: passed ? "PASSED" : "FAILED",
    verified: passed,
    needsCheck: false,
    rules,
    counts: { photos: report.counts.photos, facePhotos: report.counts.facePhotos },
    photos: photosView,
    blockers: report.blockers.map((b) => ({ code: b.code, photos: b.photos.map((i) => latest.photoIds[i]).filter((id): id is string => Boolean(id)) })),
  };
}

/** Each current photo with what the latest check found about it; a photo it did not see is PENDING. */
function carry(ordered: PhotoRow[], latest: StoredCheck, report: Report | null = readReport(latest)): PhotoCheckView["photos"] {
  return ordered.map((p) => {
    const at = latest.photoIds.indexOf(p.id);
    const found = report && at >= 0 ? report.photos.find((r) => r.index === at) : undefined;
    if (!found) return { id: p.id, check: "PENDING", faceCount: 0, findings: [] };
    return { id: p.id, check: found.kind, faceCount: found.faceCount, findings: found.findings.map((f) => f.code) };
  });
}
