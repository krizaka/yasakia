/**
 * Development data — `npm run db:seed` (also run by `npm run setup` and `db:reset`). Idempotent (accounts by e-mail),
 * refuses NODE_ENV=production.
 *
 * Every seed account says it is one: an address `@seed.yasakia.test` (the `.test` domain never delivers), a name
 * ending in "(seed)", and a **generated** avatar (geometric, no real photo). They exist so the API answers something
 * locally; the real demo — a fictional cast, licensed pictures — lives only in its own database (`npm run demo:seed`,
 * PY6), never here.
 */
import fs from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";

import { closeDb, db } from "./client";
import { loadRootEnv } from "./load-env";
import { accounts, agentSessions, profilePhotos, profiles } from "./schema";
import { generateAvatar } from "./seed-avatar";

loadRootEnv(__dirname);

type Rgb = [number, number, number];
interface SeedPerson {
  name: string;
  birthDate: string;
  locale: "en" | "fr";
  gender: "WOMAN" | "MAN" | "NON_BINARY";
  seeking: ("WOMAN" | "MAN" | "NON_BINARY")[];
  intent: "LONG_TERM" | "OPEN_TO_LONG_TERM" | "CASUAL" | "FRIENDSHIP_FIRST" | "NOT_SURE";
  /** Already rounded to the ~1 km grid, like every stored position (Montréal). */
  lat: number;
  lng: number;
  state: "ONBOARDING" | "DISCOVERY";
  colors: [Rgb, Rgb, Rgb];
}

export const SEED_DOMAIN = "seed.yasakia.test";

const PEOPLE: SeedPerson[] = [
  { name: "Ada", birthDate: "1994-03-12", locale: "fr", gender: "WOMAN", seeking: ["MAN"], intent: "LONG_TERM", lat: 45.513, lng: -73.575, state: "DISCOVERY", colors: [[16, 185, 129], [20, 184, 166], [236, 253, 245]] },
  { name: "Bastien", birthDate: "1991-07-02", locale: "fr", gender: "MAN", seeking: ["WOMAN"], intent: "LONG_TERM", lat: 45.522, lng: -73.588, state: "DISCOVERY", colors: [[13, 148, 136], [6, 182, 212], [240, 253, 250]] },
  { name: "Chloé", birthDate: "1997-11-23", locale: "fr", gender: "WOMAN", seeking: ["WOMAN", "NON_BINARY"], intent: "OPEN_TO_LONG_TERM", lat: 45.531, lng: -73.6, state: "DISCOVERY", colors: [[5, 150, 105], [52, 211, 153], [255, 255, 255]] },
  { name: "Dev", birthDate: "1989-01-30", locale: "en", gender: "NON_BINARY", seeking: ["WOMAN", "MAN", "NON_BINARY"], intent: "FRIENDSHIP_FIRST", lat: 45.504, lng: -73.562, state: "ONBOARDING", colors: [[15, 118, 110], [45, 212, 191], [240, 253, 250]] },
  { name: "Elif", birthDate: "1993-05-17", locale: "en", gender: "WOMAN", seeking: ["MAN"], intent: "NOT_SURE", lat: 45.477, lng: -73.613, state: "ONBOARDING", colors: [[6, 95, 70], [16, 185, 129], [209, 250, 229]] },
  { name: "Félix", birthDate: "1990-09-08", locale: "fr", gender: "MAN", seeking: ["WOMAN"], intent: "CASUAL", lat: 45.549, lng: -73.55, state: "DISCOVERY", colors: [[17, 94, 89], [94, 234, 212], [204, 251, 241]] },
];

/** Where local media live (MEDIA_STORAGE_PROVIDER=local): MEDIA_STORAGE_LOCAL_DIR, else `.storage/` at the repository root. */
function localStorageDir(): string {
  if (process.env.MEDIA_STORAGE_LOCAL_DIR) return path.resolve(process.env.MEDIA_STORAGE_LOCAL_DIR);
  let dir = __dirname;
  for (let i = 0; i < 6 && !fs.existsSync(path.join(dir, "yasakia.workspace.json")); i++) dir = path.dirname(dir);
  return path.join(dir, ".storage");
}

const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export async function runSeed(): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("The development seed refuses NODE_ENV=production");
  const localMedia = (process.env.MEDIA_STORAGE_PROVIDER ?? "local") === "local";
  let created = 0;
  for (const person of PEOPLE) {
    const email = `${ascii(person.name)}@${SEED_DOMAIN}`;
    const [existing] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email)).limit(1);
    if (existing) continue;
    await db.transaction(async (tx) => {
      const [account] = await tx
        .insert(accounts)
        .values({ email, locale: person.locale, birthDate: person.birthDate, termsAcceptedAt: new Date(), consentVersion: "2026-10" })
        .returning({ id: accounts.id });
      await tx.insert(profiles).values({
        accountId: account.id,
        displayName: `${person.name} (seed)`,
        gender: person.gender,
        seekingGenders: person.seeking,
        ageMin: 25,
        ageMax: 45,
        intent: person.intent,
        radiusKm: 25,
        lat: person.lat,
        lng: person.lng,
        geoPrecisionM: 1000,
        locationUpdatedAt: new Date(),
      });
      await tx.insert(agentSessions).values({ accountId: account.id, state: person.state });
      if (localMedia) {
        const avatar = generateAvatar(...person.colors);
        const [photo] = await tx
          .insert(profilePhotos)
          .values({
            accountId: account.id,
            storageKey: `pending-${account.id}`,
            mimeType: "image/png",
            bytes: avatar.png.length,
            width: avatar.width,
            height: avatar.height,
            blurhash: avatar.blurhash,
            moderationStatus: "APPROVED",
            position: 0,
            uploadExpiresAt: new Date(),
            completedAt: new Date(),
            reviewedAt: new Date(),
          })
          .returning({ id: profilePhotos.id });
        const key = `photos/${account.id}/${photo.id}.png`;
        const file = path.join(localStorageDir(), key);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, avatar.png);
        await tx.update(profilePhotos).set({ storageKey: key }).where(eq(profilePhotos.id, photo.id));
      }
    });
    created++;
  }
  console.log(
    `Seed: ${created} account(s) created, ${PEOPLE.length - created} already there (${PEOPLE.length} seed accounts @${SEED_DOMAIN}${localMedia ? ", generated avatars in local storage" : ", no avatars: MEDIA_STORAGE_PROVIDER is not local"}).`,
  );
}

if (require.main === module) {
  runSeed()
    .then(() => closeDb())
    .catch(async (error) => {
      console.error("Seed failed:", error);
      await closeDb();
      process.exit(1);
    });
}
