/**
 * Creates the base tables in an empty database.
 *
 * WHY THIS EXISTS. `database/schema.sql` is the starting point every migration
 * builds on - migration 0001 locks public.employees, and 0018 refuses to run if
 * it is missing. Locally it is applied by Postgres itself: Docker mounts it
 * into the image's entry-point directory, so a fresh container arrives with the
 * tables already there and nobody has to think about it. A hosted database
 * arrives genuinely empty, with no entry-point directory and no Docker, so the
 * step that was invisible becomes a step somebody has to run. This is it.
 *
 * SAFETY. It reads `MIGRATION_DATABASE_URL`, the same variable the migration
 * runner uses and never the application's own, and `--database <name>` must
 * match the database it actually connected to, so a stale URL in a shell cannot
 * quietly point this at something else. It refuses a database that already has
 * tables, because this is a first-run step and running it over a live schema is
 * never what anybody meant.
 */
import { readFile } from "node:fs/promises";
import pg from "pg";

const schemaFile = new URL("../../../database/schema.sql", import.meta.url);

const [flag, database, ...extra] = process.argv.slice(2);

function fail(message: string): never {
  console.error(`Refusing to apply the schema: ${message}`);
  process.exit(1);
}

if (flag !== "--database" || !database || extra.length) {
  console.error("Usage: apply-schema --database <exact-database-name>");
  process.exit(1);
}
if (!process.env.MIGRATION_DATABASE_URL) {
  fail("MIGRATION_DATABASE_URL is required; the schema is never applied to the application's own database by default.");
}

const pool = new pg.Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL,
  connectionTimeoutMillis: 10_000,
  max: 1,
});

try {
  const actual = (await pool.query<{ name: string }>("SELECT current_database() AS name")).rows[0]!.name;
  if (actual !== database) fail(`connected to "${actual}" but --database said "${database}".`);

  const existing = await pool.query<{ count: string }>(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'",
  );
  if (Number(existing.rows[0]!.count) > 0) {
    fail(
      `"${actual}" already has ${existing.rows[0]!.count} tables. This step is only for an empty database; ` +
      `run the migrations instead.`,
    );
  }

  const sql = await readFile(schemaFile, "utf8");
  // One transaction: a half-created schema is worse than none, because the
  // migrations would then run against something that looks almost right.
  await pool.query("BEGIN");
  await pool.query(sql);
  await pool.query("COMMIT");

  const created = await pool.query<{ count: string }>(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'",
  );
  console.log(`Base schema applied to "${actual}": ${created.rows[0]!.count} tables created.`);
  console.log("Next: npm run db:migrate -- --database " + actual);
} catch (error) {
  try { await pool.query("ROLLBACK"); } catch { /* the failure below is the one worth reporting */ }
  console.error("Applying the schema failed; nothing was created.", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
