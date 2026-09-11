import assert from "node:assert/strict";
import { mock, test } from "node:test";

test("session lookup against PostgreSQL with isolated temporary tables", {
  skip: process.env.HR_NEXUS_DB_TESTS !== "1",
}, async () => {
  // Uses the configured connection, but shadows business tables only in this
  // session. Rollback removes every fixture; no public records are modified.
  const { default: pool } = await import("../src/config/db.js");
  const { findSessionUserById } = await import("../src/utils/userQueries.js");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TEMP TABLE employees (
        id BIGINT PRIMARY KEY, employment_status TEXT, manager_id BIGINT
      );
      CREATE TEMP TABLE users (
        id BIGINT PRIMARY KEY, employee_id BIGINT, email TEXT, role TEXT, is_active BOOLEAN,
        must_change_password BOOLEAN NOT NULL DEFAULT FALSE
      );
      INSERT INTO employees VALUES (10, 'active'), (20, 'inactive'), (30, 'probation');
      INSERT INTO users VALUES
        (1, NULL, 'one@example.invalid', 'admin', TRUE),
        (2, 10, 'two@example.invalid', 'employee', TRUE),
        (3, 20, 'three@example.invalid', 'employee', TRUE),
        (4, 999, 'four@example.invalid', 'employee', TRUE),
        (5, 10, 'five@example.invalid', 'employee', FALSE),
        (6, NULL, 'six@example.invalid', 'employee', TRUE),
        (7, 30, 'seven@example.invalid', 'employee', TRUE);
    `);
    mock.method(pool, "query", client.query.bind(client));
    assert.deepEqual(await findSessionUserById(1),
      { id: 1, employeeId: null, role: "admin", email: "one@example.invalid",
        mustChangePassword: false, isManager: false });
    assert.deepEqual(await findSessionUserById(2),
      { id: 2, employeeId: 10, role: "employee", email: "two@example.invalid",
        mustChangePassword: false, isManager: false });
    for (const id of [3, 4, 5, 6, 999]) assert.equal(await findSessionUserById(id), null);
    assert.deepEqual(await findSessionUserById(7),
      { id: 7, employeeId: 30, role: "employee", email: "seven@example.invalid",
        mustChangePassword: false, isManager: false });

    // Manager is derived from reporting lines on every lookup, and only an
    // active or probation report makes someone a manager.
    await client.query("UPDATE employees SET manager_id = 30 WHERE id = 20");
    assert.equal((await findSessionUserById(7))!.isManager, false, "an inactive report does not count");
    await client.query("UPDATE employees SET manager_id = 30 WHERE id = 10");
    assert.equal((await findSessionUserById(7))!.isManager, true);
    await client.query("UPDATE employees SET manager_id = NULL WHERE id = 10");
    assert.equal((await findSessionUserById(7))!.isManager, false, "removing the last report removes the scope");
    await client.query("UPDATE users SET is_active = FALSE WHERE id = 2");
    assert.equal(await findSessionUserById(2), null);
    await client.query("UPDATE users SET role = 'employee', employee_id = 10 WHERE id = 1");
    assert.deepEqual(await findSessionUserById(1),
      { id: 1, employeeId: 10, role: "employee", email: "one@example.invalid",
        mustChangePassword: false, isManager: false });
    // The session user feeds every authorization decision. It carries an email
    // for the audit log and nothing else about the account.
    const session = await findSessionUserById(1);
    assert.deepEqual(
      Object.keys(session!).sort(),
      ["email", "employeeId", "id", "isManager", "mustChangePassword", "role"],
    );

    // The forced-change state is read from the column on every lookup, so a
    // change made after the session began is seen immediately.
    await client.query("UPDATE users SET must_change_password = TRUE WHERE id = 1");
    assert.equal((await findSessionUserById(1))!.mustChangePassword, true);
  } finally {
    mock.restoreAll();
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
