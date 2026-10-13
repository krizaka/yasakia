/**
 * Photo moderation behind one interface. V1 approves automatically (`autoApprove`) — a report reopens the review
 * (`reports.photo_id`, triaged by operators). A vision model through Orazaka is the planned V2 implementation: same
 * interface, chosen by `MEDIA_PHOTO_MODERATION`.
 */
export type ModerationVerdict = "APPROVED" | "REJECTED" | "PENDING";

export interface PhotoForReview {
  id: string;
  accountId: string;
  width: number;
  height: number;
  /** The stored (re-encoded) bytes. */
  body: Buffer;
}

export interface PhotoModeration {
  readonly name: string;
  review(photo: PhotoForReview): Promise<ModerationVerdict>;
}

export const autoApprove: PhotoModeration = {
  name: "auto",
  async review() {
    return "APPROVED";
  },
};

/** The moderation of this deployment (`MEDIA_PHOTO_MODERATION`, default `auto` — the only one in V1). */
export function photoModeration(name: string | undefined): PhotoModeration {
  const chosen = name?.trim().toLowerCase() || "auto";
  if (chosen === "auto") return autoApprove;
  throw new Error(`MEDIA_PHOTO_MODERATION must be "auto" (V1), not "${chosen}"`);
}
