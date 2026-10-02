import { readFile } from "node:fs/promises";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing. Copy .env.example to .env.local and set it first.");
}

const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const sql = postgres(connectionString, {
  ssl: "require",
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
});

try {
  await sql.unsafe(schema);
  console.log("CleanRoute database schema installed successfully.");
} finally {
  await sql.end();
}
