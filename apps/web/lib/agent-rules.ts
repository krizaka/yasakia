import type { Extraction } from "@yasakia/ai";

import type { AgentParams } from "./rule-sets";

/**
 * The agent's rules, pure: what it still has to learn, when it knows enough to write the portrait, and what of an
 * extraction may touch the profile. Parameters come from the AGENT rule set (a row), never from here.
 */

/** The agent's state machine (the `agent_state` enum) and the roles of its transcript (`agent_message_role`). */
export const AgentState = { Onboarding: "ONBOARDING", Discovery: "DISCOVERY", WaitingPool: "WAITING_POOL", BatchReady: "BATCH_READY", BatchOpen: "BATCH_OPEN", DebriefDue: "DEBRIEF_DUE" } as const;
export type AgentState = (typeof AgentState)[keyof typeof AgentState];
export const MessageRole = { User: "USER", Agent: "AGENT", System: "SYSTEM" } as const;
export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

/** The basics every batch needs — the hard filters. Radius is optional (a default exists). */
export const REQUIRED_BASICS = ["gender", "seekingGenders", "ageRange", "intent", "place"] as const;
export type Basic = (typeof REQUIRED_BASICS)[number];

/** Words the agent's prompt uses for a missing basic (model-facing, English). */
export const BASIC_WORDS: Record<Basic, string> = {
  gender: "their gender",
  seekingGenders: "who they want to meet",
  ageRange: "the age range of the people they want to meet",
  intent: "what they are looking for (long-term, casual…)",
  place: "the city they live in",
};

/** The basics the person has stated in their words (a facet `basics_said` lists them). */
export function missingBasics(said: readonly string[]): Basic[] {
  return REQUIRED_BASICS.filter((b) => !said.includes(b));
}

/** The profile columns an extraction may set, with the basics it states. Only what is present and valid — never a default invented. */
export interface BasicsUpdate {
  profile: Partial<{ displayName: string; gender: "WOMAN" | "MAN" | "NON_BINARY"; seekingGenders: ("WOMAN" | "MAN" | "NON_BINARY")[]; ageMin: number; ageMax: number; intent: string; radiusKm: number }>;
  place: { city: string; lat: number; lng: number } | null;
  said: Basic[];
}

export function basicsFrom(extraction: Extraction): BasicsUpdate {
  const b = extraction.basics ?? {};
  const profile: BasicsUpdate["profile"] = {};
  const said: Basic[] = [];
  const name = b.displayName?.trim();
  if (name) profile.displayName = name;
  if (b.gender) {
    profile.gender = b.gender;
    said.push("gender");
  }
  if (b.seekingGenders?.length) {
    profile.seekingGenders = [...new Set(b.seekingGenders)];
    said.push("seekingGenders");
  }
  if (b.ageMin != null && b.ageMax != null && b.ageMax >= b.ageMin) {
    profile.ageMin = b.ageMin;
    profile.ageMax = b.ageMax;
    said.push("ageRange");
  }
  if (b.intent) {
    profile.intent = b.intent;
    said.push("intent");
  }
  if (b.radiusKm) profile.radiusKm = b.radiusKm;
  const place = b.place && Number.isFinite(b.place.lat) && Number.isFinite(b.place.lng) && !(b.place.lat === 0 && b.place.lng === 0) ? b.place : null;
  if (place) said.push("place");
  return { profile, place, said };
}

export interface Readiness {
  ready: boolean;
  /** Why not, for the log and the tests — never shown. */
  reason: "ok" | "too-few-turns" | "basics-missing" | "facets-missing";
}

/** Does the agent know enough? Enough turns, every basic, the required facets, and the minimum number of facets. */
export function readiness(input: { userTurns: number; said: readonly string[]; facetKeys: readonly string[] }, params: AgentParams): Readiness {
  if (input.userTurns < params.minUserTurns) return { ready: false, reason: "too-few-turns" };
  if (missingBasics(input.said).length) return { ready: false, reason: "basics-missing" };
  const have = new Set(input.facetKeys.filter((k) => k !== "basics_said"));
  if (!params.requiredFacets.every((k) => have.has(k)) || have.size < params.minFacets) return { ready: false, reason: "facets-missing" };
  return { ready: true, reason: "ok" };
}

/** A rough token count for the budget: the engine does not report usage on a stream (4 characters a token). */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4); // @fixed: a rule of thumb for the cost dashboard, not a business parameter
