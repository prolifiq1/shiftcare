// Runs once when a Next.js server instance starts (before serving requests).
// Ensures the Postgres schema exists and, on a brand-new empty database,
// seeds demo data so a fresh deploy is immediately usable. Set AUTO_SEED=0
// to disable auto-seeding in real production.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureSchema, db } = await import("./lib/db");
    const { agencies } = await import("./lib/schema");
    await ensureSchema();

    if (process.env.AUTO_SEED === "0") return;
    const rows = await db.select().from(agencies).all();
    if (rows.length === 0) {
      const { seedDatabase } = await import("./lib/seed");
      await seedDatabase();
      console.log("[instrumentation] empty database detected — seeded demo data");
    }
  } catch (err) {
    console.error("[instrumentation] schema/seed bootstrap failed:", err);
  }
}
