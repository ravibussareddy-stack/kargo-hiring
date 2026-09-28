// Runs supabase/schema.sql against the database. Usage: npm run db:migrate
// Needs SUPABASE_DB_URL in .env.local (Supabase -> Connect -> Session pooler URI).
// Local-only: do NOT add SUPABASE_DB_URL to Vercel.
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set in .env.local. Or paste supabase/schema.sql into the Supabase SQL editor instead.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
const { rows } = await client.query(
  "select table_name from information_schema.tables where table_schema='public' and table_name = any($1) order by 1",
  [["candidates", "emails", "role_results", "rubric_criteria", "scores", "settings"]],
);
console.log("Schema applied. Tables:", rows.map((r) => r.table_name).join(", "));
await client.end();
