import { after } from "next/server";
import { z } from "zod";

import { confirmDeletion, deleteAccount, meView, patchMe } from "@/lib/account";
import { requireUser } from "@/lib/auth";
import { handle, ok, readJson } from "@/lib/http";
import { purgeSoon } from "@/lib/jobs";
import { limitAction } from "@/lib/rate-limit";

const Gender = z.enum(["WOMAN", "MAN", "NON_BINARY"]);

const Patch = z
  .object({
    displayName: z.string().trim().min(1).max(40),
    locale: z.enum(["en", "fr"]),
    gender: Gender,
    seekingGenders: z.array(Gender).max(3),
    ageMin: z.number().int().min(18).max(120),
    ageMax: z.number().int().min(18).max(120),
    intent: z.enum(["LONG_TERM", "OPEN_TO_LONG_TERM", "CASUAL", "FRIENDSHIP_FIRST", "NOT_SURE"]),
    radiusKm: z.number().int().min(1).max(500),
    paused: z.boolean(),
  })
  .partial()
  .strict();

/** The signed-in account: e-mail, status, language, age (never the date of birth), profile, rounded position, the agent's state. */
export async function GET(req: Request) {
  return handle("me", async () => {
    const me = await requireUser(req);
    return ok(await meView(me.id));
  });
}

/** Changes the profile, the language, or pauses the account (nobody is shown it any more; its batches and intros stay open). */
export async function PATCH(req: Request) {
  return handle("me", async () => {
    const me = await requireUser(req);
    const patch = await readJson(req, Patch);
    return ok(await patchMe(me.id, { ...patch, seekingGenders: patch.seekingGenders ? [...new Set(patch.seekingGenders)] : undefined }));
  });
}

/**
 * Deletes the account for good, at once — every row that is theirs, in one transaction; the photos are purged from
 * storage right after (retried until done, 30 days at most) and a confirmation e-mail leaves.
 */
export async function DELETE(req: Request) {
  return handle("me", async () => {
    const me = await requireUser(req);
    await limitAction("delete-account", req, me.id, { perIp: [10, 3600] });
    const deletion = await deleteAccount(me.id);
    after(async () => {
      purgeSoon();
      await confirmDeletion(deletion.email, deletion.locale);
    });
    return ok({ deleted: true, purgeDeadlineDays: 30 });
  });
}
