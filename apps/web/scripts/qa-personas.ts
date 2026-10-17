/**
 * `npm run db:qa-personas` — seeds the fictional Montréal cast (packages/db/personas/montreal.json) on a local or dev
 * database: adults who do not exist, no photo, a portrait each, embedded by the real engine (Orazaka) so that a batch
 * shows the real matching. Idempotent (by address). Refuses production and staging. Needs `AI_ENGINE_URL` and
 * `AI_ENGINE_API_KEY` (it embeds for real) and `DATABASE_URL`; nothing is printed of either.
 */
import fs from "node:fs";
import path from "node:path";

import { accounts, agentSessions, closeDb, db, facetEmbeddings, profiles, writeFacet } from "@yasakia/db";
import { eq } from "drizzle-orm";

import { loadRootEnv } from "../../../packages/db/src/load-env";
import { aiProvider } from "../lib/env";
import { Cast, personaEmail, personaSeedRefusal, textsToEmbed } from "../lib/personas";

loadRootEnv(__dirname);

async function main() {
  const refusal = personaSeedRefusal(process.env);
  if (refusal) throw new Error(refusal);
  const cast = Cast.parse(JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../packages/db/personas/montreal.json"), "utf8")));
  const ai = aiProvider();
  const embedded = await ai.embed(textsToEmbed(cast.personas));
  console.log(`embedded ${embedded.vectors.length} portraits — model ${embedded.model}, run ${embedded.runId}`);
  const now = new Date();

  for (const [i, p] of cast.personas.entries()) {
    const email = personaEmail(p.slug);
    await db.transaction(async (tx) => {
      let [account] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email)).limit(1);
      if (!account) {
        [account] = await tx
          .insert(accounts)
          .values({ email, locale: p.locale, birthDate: `${p.birthYear}-06-15`, termsAcceptedAt: now, consentVersion: "2026-10", role: "USER" })
          .returning({ id: accounts.id });
      }
      const profile = { displayName: p.displayName, gender: p.gender, seekingGenders: p.seekingGenders, ageMin: p.ageMin, ageMax: p.ageMax, intent: p.intent, radiusKm: p.radiusKm, lat: p.lat, lng: p.lng, geoPrecisionM: 1000, locationUpdatedAt: now, onboardingCompletedAt: now, updatedAt: now };
      await tx.insert(profiles).values({ accountId: account.id, ...profile }).onConflictDoUpdate({ target: profiles.accountId, set: profile });
      const session = { state: "WAITING_POOL" as const, portrait: { ...p.portrait, embeddingRunId: embedded.runId }, stateChangedAt: now, updatedAt: now };
      await tx.insert(agentSessions).values({ accountId: account.id, ...session }).onConflictDoUpdate({ target: agentSessions.accountId, set: session });
      for (const [key, value] of Object.entries(p.facets)) await writeFacet(tx as never, account.id, { key, value, sensitive: false, confidence: 1 });
      for (const [offset, kind] of [[0, "SELF"], [1, "SEEKING"]] as const) {
        const vector = embedded.vectors[i * 2 + offset];
        await tx.insert(facetEmbeddings).values({ accountId: account.id, kind, vector, model: embedded.model }).onConflictDoUpdate({ target: [facetEmbeddings.accountId, facetEmbeddings.kind], set: { vector, model: embedded.model, createdAt: now } });
      }
    });
    console.log(`  ${p.displayName} (${email})`);
  }
  console.log(`Fictional cast ready: ${cast.personas.length} adults who do not exist.`);
}

main()
  .then(() => closeDb())
  .catch(async (error) => {
    console.error("QA personas failed:", (error as Error).message);
    await closeDb();
    process.exit(1);
  });
