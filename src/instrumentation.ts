// Runs once when a Next.js server instance starts (before serving requests).
// Ensures the Postgres schema exists and, on a brand-new empty database,
// seeds demo data exactly once (advisory-locked, race-safe across the many
// concurrent serverless instances). Set AUTO_SEED=0 to disable in real prod.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureSchema, ensureSeeded } = await import("./lib/db");
    await ensureSchema();
    if (process.env.AUTO_SEED === "0") return;
    const { seedDatabase } = await import("./lib/seed");
    await ensureSeeded(seedDatabase);
  } catch (err) {
    console.error("[instrumentation] schema/seed bootstrap failed:", err);
  }
}
