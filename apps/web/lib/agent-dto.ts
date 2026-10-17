/** What `GET /api/agent` answers — shared by the page (server) and its client component. */
export interface AgentDto {
  state: "ONBOARDING" | "DISCOVERY" | "WAITING_POOL" | "BATCH_READY" | "BATCH_OPEN" | "DEBRIEF_DUE";
  messages: { id: string; role: "USER" | "AGENT"; content: string; createdAt: string }[];
  facets: { key: string; value: unknown; sensitive: boolean }[];
  portrait: { self: string; seeking: string } | null;
  missingBasics: ("gender" | "seekingGenders" | "ageRange" | "intent" | "place")[];
  progress: { userTurns: number; minUserTurns: number };
  waiting: boolean;
  /** The engine run ids (last of each purpose): the line in Orazaka's logs. */
  evidence: Record<string, string>;
}
