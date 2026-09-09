import type pg from "pg";

/**
 * Every laboratory suite clones a database per run, and the laboratory's data
 * directory is a small RAM-backed tmpfs. Clones that are never dropped
 * accumulate until the server can no longer write, which is what eventually
 * happened. A passing run therefore removes what it created; a failing run keeps
 * its clones so the failure can still be inspected by hand.
 *
 * Clones are matched on the run's random suffix rather than tracked by name, so
 * a suite that creates extra databases mid-test cannot leak them by omission.
 */
export async function dropLabClones(
  admin: pg.Pool,
  suffix: string,
  completed: boolean,
  t: { diagnostic: (message: string) => void },
): Promise<void> {
  if (!completed) {
    t.diagnostic(`Lab clones ending in ${suffix} were retained because the suite did not finish.`);
    return;
  }
  const { rows } = await admin.query<{ datname: string }>(
    "SELECT datname FROM pg_database WHERE datname LIKE '%\\_' || $1",
    [suffix],
  );
  for (const { datname } of rows) {
    // The identifier came back from pg_database, so it already exists; quoting
    // it keeps the statement well-formed whatever the name contains.
    await admin.query(`DROP DATABASE IF EXISTS "${datname.replaceAll('"', '""')}" WITH (FORCE)`);
  }
}
