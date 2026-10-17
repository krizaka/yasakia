/**
 * `npm run db:qa-reset` — gives the QA person's agent a blank page again, so the journey can be shown from its start
 * (a recording, a demo): the conversation, what the agent understood, the portrait and its vectors, the batches and their debriefs, the introductions, the
 * profile's basics and position. It touches **one** account, and only a QA address (`qa+…@`) — it can never reset a real
 * person — and never a production database. The account, its password and its sessions stay.
 */
import { closeDb } from "./client";
import { loadRootEnv } from "./load-env";
import { qaResetRefusal, resetQaAgent } from "./qa-reset-core";

export { qaResetRefusal, resetQaAgent };

loadRootEnv(__dirname);

if (require.main === module) {
  const email = (process.env.AUTH_QA_USER_EMAIL ?? "qa+user@yasakia.com").trim().toLowerCase();
  const refusal = qaResetRefusal(email, process.env);
  if (refusal) {
    console.error(`QA reset ${refusal}`);
    process.exit(1);
  }
  resetQaAgent(email)
    .then(async (done) => {
      console.log(done ? `QA agent reset: ${email} starts from a blank page.` : `QA reset: no account ${email}.`);
      await closeDb();
    })
    .catch(async (error) => {
      console.error("QA reset failed:", (error as Error).message);
      await closeDb();
      process.exit(1);
    });
}
