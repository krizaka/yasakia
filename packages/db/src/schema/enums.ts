import { pgEnum } from "drizzle-orm/pg-core";

/** ACTIVE · PAUSED (no longer shown to anyone; open batches and intros stay open) · SUSPENDED (by an operator: cannot sign in). */
export const accountStatusEnum = pgEnum("account_status", ["ACTIVE", "PAUSED", "SUSPENDED"]);

/** The languages Yazakia is designed in (French is a language of design, not a translation). */
export const localeEnum = pgEnum("locale", ["en", "fr"]);

export const genderEnum = pgEnum("gender", ["WOMAN", "MAN", "NON_BINARY"]);

/** What the person is looking for — a non-negotiable, checked in both directions by the matching (PY3). */
export const relationshipIntentEnum = pgEnum("relationship_intent", ["LONG_TERM", "OPEN_TO_LONG_TERM", "CASUAL", "FRIENDSHIP_FIRST", "NOT_SURE"]);

/** UPLOADING (signed URL issued) → PENDING (bytes verified) → APPROVED | REJECTED (PhotoModeration). */
export const photoModerationStatusEnum = pgEnum("photo_moderation_status", ["UPLOADING", "PENDING", "APPROVED", "REJECTED"]);

/** The account's state machine (prompts-yazakia.md §1.2). PAUSED is orthogonal: it is the account's status. */
export const agentStateEnum = pgEnum("agent_state", ["ONBOARDING", "DISCOVERY", "WAITING_POOL", "BATCH_READY", "BATCH_OPEN", "DEBRIEF_DUE"]);

export const agentMessageRoleEnum = pgEnum("agent_message_role", ["USER", "AGENT", "SYSTEM"]);

/** SELF — who I am; SEEKING — who I am looking for. A pair's score is min(sim(A.seeking, B.self), sim(B.seeking, A.self)). */
export const embeddingKindEnum = pgEnum("embedding_kind", ["SELF", "SEEKING"]);

export const batchStatusEnum = pgEnum("batch_status", ["OPEN", "DEBRIEF_DUE", "DONE", "EXPIRED"]);

export const batchDecisionEnum = pgEnum("batch_decision", ["INTERESTED", "PASS", "TELL_ME_MORE"]);

/** OPEN (7 days) → CONTINUED (both said so) | FADED (time ran out) | CLOSED (block, report, deletion). */
export const introStateEnum = pgEnum("intro_state", ["OPEN", "CONTINUED", "FADED", "CLOSED"]);

/** Normalised report reasons; UNDERAGE and THREAT are reviewed first. */
export const reportReasonEnum = pgEnum("report_reason", [
  "UNDERAGE",
  "THREAT",
  "HARASSMENT",
  "HATE",
  "SCAM",
  "FAKE_PROFILE",
  "INAPPROPRIATE_PHOTO",
  "OFFLINE_BEHAVIOUR",
  "OTHER",
]);

export const reportStatusEnum = pgEnum("report_status", ["OPEN", "REVIEWED", "ACTIONED", "DISMISSED"]);

export const pushPlatformEnum = pgEnum("push_platform", ["ios", "android"]);

/** What an AI call was for — the cost dashboard groups by it (PY3). */
export const aiCallPurposeEnum = pgEnum("ai_call_purpose", ["CHAT", "EXTRACT", "EMBED", "PORTRAIT", "REASONS", "DEBRIEF", "OPENER"]);

export const exportStatusEnum = pgEnum("export_status", ["PENDING", "READY", "FAILED"]);
