import { seedDatabase } from "../src/lib/seed";
import { pool } from "../src/lib/db";

seedDatabase()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
