import { z } from "zod";

/**
 * The fictional cast of the dev and QA deployments — adults who do not exist, with no photo — so that a batch can be
 * shown for real (the engine's real embeddings, the real matching) without a single real person. The data is
 * `packages/db/personas/montreal.json`; `npm run db:qa-personas` writes it, on a local or dev database only.
 */

export const PERSONA_DOMAIN = "@personas.yasakia.test";

const Gender = z.enum(["WOMAN", "MAN", "NON_BINARY"]);
const Intent = z.enum(["LONG_TERM", "OPEN_TO_LONG_TERM", "CASUAL", "FRIENDSHIP_FIRST", "NOT_SURE"]);

export const Persona = z.object({
  slug: z.string().regex(/^[a-z]+$/),
  displayName: z.string().min(1).max(40),
  gender: Gender,
  seekingGenders: z.array(Gender).min(1),
  birthYear: z.number().int().min(1950).max(2007),
  ageMin: z.number().int().min(18),
  ageMax: z.number().int().max(120),
  intent: Intent,
  radiusKm: z.number().int().min(1).max(500),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  locale: z.enum(["en", "fr"]),
  portrait: z.object({ self: z.string().min(10), seeking: z.string().min(10), selfEn: z.string().min(10), seekingEn: z.string().min(10) }),
  facets: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});
export type Persona = z.infer<typeof Persona>;

export const Cast = z.object({ region: z.string(), personas: z.array(Persona).min(1) }).passthrough();

export const personaEmail = (slug: string): string => `persona+${slug}${PERSONA_DOMAIN}`;

/** Why the cast may not be seeded here, or null: never on production, only where fiction is honest (local or dev). */
export function personaSeedRefusal(env: Record<string, string | undefined>): string | null {
  const appEnv = env.NEXT_PUBLIC_APP_ENV?.trim();
  if (appEnv === "production" || appEnv === "staging") return `refused: NEXT_PUBLIC_APP_ENV=${appEnv} — the fictional cast lives on local and dev databases only`;
  if (env.NODE_ENV === "production" && appEnv !== "dev") return "refused: a production server without NEXT_PUBLIC_APP_ENV=dev — the fictional cast lives on local and dev databases only";
  return null;
}

/** The two texts that are embedded, in the order of the vectors: `[SELF, SEEKING]` per person, person after person. */
export function textsToEmbed(cast: readonly Persona[]): string[] {
  return cast.flatMap((p) => [p.portrait.selfEn, p.portrait.seekingEn]);
}
