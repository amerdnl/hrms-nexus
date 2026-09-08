import pg from "pg";
import { MigrationError, runMigrations } from "./migrations.js";

const [mode, flag, database, ...extra] = process.argv.slice(2);
if ((mode !== "status" && mode !== "apply") || flag !== "--database" || !database || extra.length) {
  console.error("Usage: migrate <status|apply> --database <exact-database-name>");
  process.exitCode = 1;
} else if (!process.env.MIGRATION_DATABASE_URL) {
  console.error("MIGRATION_DATABASE_URL is required; migrations never default to the application's database.");
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, connectionTimeoutMillis: 5000 });
  pool.on("error", () => console.error("Migration database connection failed"));
  try {
    const result = await runMigrations(pool, { mode, database });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof MigrationError ? error.message : "Migration command failed; check database availability and schema compatibility.");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
