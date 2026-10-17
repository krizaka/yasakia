import { z } from "zod";

/** The soft facets the agent listens for — keys are data, words are the person's own. `sensitive` ones are sealed at rest. */
export const FACETS = [
  { key: "story", sensitive: false, hint: "who they are in two or three sentences: work, what fills their days, what they are proud of" },
  { key: "passions", sensitive: false, hint: "what they love doing, concretely (a list of short phrases)" },
  { key: "values", sensitive: false, hint: "what matters to them in life and in a relationship (a list of short phrases)" },
  { key: "humour", sensitive: false, hint: "how they are funny or what makes them laugh" },
  { key: "weekend", sensitive: false, hint: "what a good weekend looks like for them" },
  { key: "seeking", sensitive: false, hint: "who they hope to meet, in their words, beyond age and gender" },
  { key: "dealbreakers", sensitive: true, hint: "what they cannot live with (a list of short phrases)" },
  { key: "beliefs", sensitive: true, hint: "religion, politics or worldview, only if THEY brought it up as something that matters" },
] as const;
export type FacetKey = (typeof FACETS)[number]["key"];
export const FACET_KEYS = FACETS.map((f) => f.key) as readonly FacetKey[];
export const isSensitiveFacet = (key: string): boolean => FACETS.some((f) => f.key === key && f.sensitive);

const Gender = z.enum(["WOMAN", "MAN", "NON_BINARY"]);
const Intent = z.enum(["LONG_TERM", "OPEN_TO_LONG_TERM", "CASUAL", "FRIENDSHIP_FIRST", "NOT_SURE"]);

/** What the models answer to "what did you understand?" — every field optional: the agent never invents what was not said. */
export const Extraction = z.object({
  basics: z
    .object({
      displayName: z.string().trim().min(1).max(40).nullish(),
      gender: Gender.nullish(),
      seekingGenders: z.array(Gender).max(3).nullish(),
      ageMin: z.number().int().min(18).max(120).nullish(),
      ageMax: z.number().int().min(18).max(120).nullish(),
      intent: Intent.nullish(),
      radiusKm: z.number().int().min(1).max(500).nullish(),
      place: z.object({ city: z.string().trim().min(1).max(80), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullish(),
    })
    .nullish(),
  facets: z
    .array(
      z.object({
        key: z.string().refine((k) => (FACET_KEYS as readonly string[]).includes(k), "unknown facet"),
        value: z.union([z.string().trim().min(1).max(600), z.array(z.string().trim().min(1).max(120)).min(1).max(12)]),
      }),
    )
    .max(20)
    .nullish(),
});
export type Extraction = z.infer<typeof Extraction>;

/** The portrait: shown to the person in their language, embedded in English (the embedding model is English). */
export const Portrait = z.object({
  self: z.string().trim().min(10).max(1500),
  seeking: z.string().trim().min(10).max(1500),
  selfEn: z.string().trim().min(10).max(1500),
  seekingEn: z.string().trim().min(10).max(1500),
});
export type Portrait = z.infer<typeof Portrait>;

/** Why two people fit, in words, in each direction — never a number. */
export const Reasons = z.object({
  forYou: z.array(z.string().trim().min(5).max(240)).min(1).max(3),
  forThem: z.array(z.string().trim().min(5).max(240)).min(1).max(3),
});
export type Reasons = z.infer<typeof Reasons>;

export const TurnRole = { User: "USER", Agent: "AGENT" } as const;
export type TurnRole = (typeof TurnRole)[keyof typeof TurnRole];
export interface Turn {
  role: TurnRole;
  content: string;
}
export type Language = "en" | "fr";

/** The reasons for a whole batch, one entry per person introduced (by the index the prompt gave them). */
export const BatchReasons = z.object({
  people: z.array(z.object({ index: z.number().int().min(1).max(10), forYou: Reasons.shape.forYou, forThem: Reasons.shape.forThem })).min(1).max(10),
});
export type BatchReasons = z.infer<typeof BatchReasons>;
