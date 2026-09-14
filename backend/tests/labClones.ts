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
    await waitUntilIdle(admin, datname);
    // The identifier came back from pg_database, so it already exists; quoting
    // it keeps the statement well-formed whatever the name contains.
    await admin.query(`DROP DATABASE IF EXISTS "${datname.replaceAll('"', '""')}" WITH (FORCE)`);
  }
}

/**
 * The intermittent recorded since V2 ("terminating connection due to
 * administrator command" failing a whole file after every check passed): the
 * forced drop could reach a connection of this run that had not finished
 * leaving - a backend still exiting after its pool ended, or work a request had
 * started still completing. A terminated connection without an error listener
 * then fails the file. Waiting for the clone to have no other sessions removes
 * that window; the forced drop stays as the backstop for a session that never
 * leaves, after five seconds.
 */
async function waitUntilIdle(admin: pg.Pool, datname: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const { rows } = await admin.query<{ connected: number }>(
      "SELECT count(*)::int AS connected FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [datname],
    );
    if (rows[0]!.connected === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
