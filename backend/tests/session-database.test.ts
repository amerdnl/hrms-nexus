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
      CREATE TEMP TABLE employees (id BIGINT PRIMARY KEY, employment_status TEXT);
      CREATE TEMP TABLE users (
        id BIGINT PRIMARY KEY, employee_id BIGINT, role TEXT, is_active BOOLEAN
      );
      INSERT INTO employees VALUES (10, 'active'), (20, 'inactive'), (30, 'probation');
      INSERT INTO users VALUES
        (1, NULL, 'admin', TRUE),
        (2, 10, 'employee', TRUE),
        (3, 20, 'employee', TRUE),
        (4, 999, 'employee', TRUE),
        (5, 10, 'employee', FALSE),
        (6, NULL, 'employee', TRUE),
        (7, 30, 'employee', TRUE);
    `);
    mock.method(pool, "query", client.query.bind(client));
    assert.deepEqual(await findSessionUserById(1), { id: 1, employeeId: null, role: "admin" });
    assert.deepEqual(await findSessionUserById(2), { id: 2, employeeId: 10, role: "employee" });
    for (const id of [3, 4, 5, 6, 999]) assert.equal(await findSessionUserById(id), null);
    assert.deepEqual(await findSessionUserById(7), { id: 7, employeeId: 30, role: "employee" });
    await client.query("UPDATE users SET is_active = FALSE WHERE id = 2");
    assert.equal(await findSessionUserById(2), null);
    await client.query("UPDATE users SET role = 'employee', employee_id = 10 WHERE id = 1");
    assert.deepEqual(await findSessionUserById(1), { id: 1, employeeId: 10, role: "employee" });
  } finally {
    mock.restoreAll();
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
