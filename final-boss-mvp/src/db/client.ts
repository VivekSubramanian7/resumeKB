import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";
import * as schema from "./schema.js";

// ponytail: Railway's public proxy requires SSL; local dev doesn't. Detect by URL.
const needsSsl = !config.databaseUrl.includes("localhost") && !config.databaseUrl.includes("127.0.0.1");
const connection = postgres(config.databaseUrl, { connect_timeout: 10, ...(needsSsl && { ssl: "require" }) });
export const db = drizzle(connection, { schema });
