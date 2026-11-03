/** Called once when a server instance starts: starts the background jobs (Node.js runtime only, never during the build). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { startScheduler } = await import("@/server/scheduler");
  startScheduler();
}
