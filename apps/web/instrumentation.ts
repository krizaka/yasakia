/**
 * Server start-up (Node runtime only, never during the build): a production server **refuses to start** without the
 * secrets every request needs and what protects the data (lib/env.ts `assertProductionConfig`) — it logs what is
 * missing and exits, so the platform's health check fails and the release is rolled back. Then the background loops
 * start (lib/jobs.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertProductionConfig } = await import("./lib/env");
  try {
    assertProductionConfig();
  } catch (error) {
    console.error(`[yasakia] refusing to start: ${(error as Error).message}`);
    process.exit(1);
  }
  const { startJobs } = await import("./lib/jobs");
  startJobs();
}
