import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./client.js";

async function run() {
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  console.log("Done.");
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
