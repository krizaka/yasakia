import { IntroState } from "./intro-rules";

/**
 * Who may see the media of a conversation, pure. The other person sees a photo, a video or a voice message only once it has passed
 * the safety check (APPROVED) and only while the conversation lives (OPEN or CONTINUED, not frozen, inside its days — the expiry of
 * the media is the conversation's); the sender sees their own while its bytes exist, and its state. Anyone else gets a 404.
 */

/** The `intro_media.status` values. */
export const MediaStatus = { Uploading: "UPLOADING", Pending: "PENDING", Approved: "APPROVED", Rejected: "REJECTED", Gone: "GONE" } as const;
export type MediaStatus = (typeof MediaStatus)[keyof typeof MediaStatus];

/** The `intro_messages.kind` values. */
export const MessageKind = { Text: "TEXT", Photo: "PHOTO", Video: "VIDEO", Audio: "AUDIO" } as const;

export interface MediaAccessInput {
  viewerIsSender: boolean;
  status: MediaStatus;
  introState: string;
  frozen: boolean;
  /** The conversation is past its days (an OPEN one; a CONTINUED one has no end). */
  expired: boolean;
}

export type MediaAccess = { allowed: true; as: "sender" | "recipient" } | { allowed: false; reason: "NOT_APPROVED" | "GONE" | "CONVERSATION_ENDED" };

export function mediaAccess(input: MediaAccessInput): MediaAccess {
  if (input.status === MediaStatus.Rejected || input.status === MediaStatus.Gone) return { allowed: false, reason: input.viewerIsSender ? "GONE" : "NOT_APPROVED" };
  const live = (input.introState === IntroState.Open && !input.expired) || input.introState === IntroState.Continued;
  if (!live || input.frozen) return { allowed: false, reason: "CONVERSATION_ENDED" };
  if (input.viewerIsSender) return { allowed: true, as: "sender" };
  return input.status === MediaStatus.Approved ? { allowed: true, as: "recipient" } : { allowed: false, reason: "NOT_APPROVED" };
}

/** Whether a media message appears in a person's thread at all. */
export function visibleMedia(viewerId: string, row: { senderId: string; status: string }): boolean {
  if (row.status === MediaStatus.Gone) return false;
  if (row.senderId === viewerId) return true; // including a refused one: the sender is told why
  return row.status === MediaStatus.Approved;
}

/** Who is told when the safety check decides (ids only, over the event stream): both people of an approval, the other first; the sender alone of a refusal (they learn why); nobody of a held one. */
export function decisionRecipients(verdict: string, row: { senderId: string; accountA: string; accountB: string }): string[] {
  const other = row.senderId === row.accountA ? row.accountB : row.accountA;
  if (verdict === "APPROVED") return [other, row.senderId];
  if (verdict === "REJECTED") return [row.senderId];
  return [];
}
