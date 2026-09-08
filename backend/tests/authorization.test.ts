import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { after, before, beforeEach, mock, test } from "node:test";
import jwt from "jsonwebtoken";

// Never load local credentials or connect to a real database in this suite.
process.env.DATABASE_URL = "postgresql://localhost:1/hr_nexus_test_not_used";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
const { default: pool } = await import("../src/config/db.js");
const { default: app } = await import("../src/app.js");

type Account = { id: string; employee_id: string | null; role: string; active: boolean; status: string };
let accounts: Map<number, Account>;
let queries: Array<{ sql: string; values: unknown[] }>;
let queryFailure = false;
const queryMock = mock.method(pool, "query", async (sql: string, values: unknown[] = []) => {
  const normalized = sql.replace(/\s+/g, " ").trim();
  queries.push({ sql: normalized, values });
  if (queryFailure) throw new Error("Simulated database unavailable");
  let rows: unknown[];
  if (normalized.startsWith("SELECT u.id, u.employee_id, u.role")) {
    const account = accounts.get(Number(values[0]));
    rows = account?.active && (
      (account.role === "admin" && account.employee_id === null) ||
      ["active", "probation"].includes(account.status)
    ) ? [account] : [];
  } else if (normalized.startsWith("SELECT employee_id FROM users")) {
    rows = [{ employee_id: accounts.get(Number(values[0]))?.employee_id }];
  } else if (normalized.includes("FROM leave_requests WHERE id = $1 AND employee_id = $2")) {
    rows = Number(values[0]) === 100 && Number(values[1]) === 10
      ? [{ id: 100, employee_id: "10", reason: "Own leave" }] : [];
  } else if (normalized.includes("FROM leave_requests WHERE employee_id = $1")) {
    rows = [{ id: 100, employee_id: String(values[0]) }];
  } else if (normalized.includes("FROM attendance WHERE employee_id = $1")) {
    rows = [];
  } else if (normalized.includes("FROM employees e LEFT JOIN departments") ||
             normalized.includes("FROM departments d LEFT JOIN employees")) {
    rows = [];
  } else if (normalized.startsWith("SELECT id, employee_id, email, password_hash")) {
    const account = accounts.get(Number(values[0]));
    rows = account ? [{ ...account, is_active: account.active }] : [];
  } else {
    throw new Error(`Unexpected test query: ${normalized}`);
  }
  return { rows, rowCount: rows.length };
});
mock.method(pool, "connect", () => { throw new Error("Unexpected database mutation"); });

const server = app.listen(0, "127.0.0.1");
let baseUrl: string;
before(async () => {
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});
beforeEach(() => {
  accounts = new Map([
    [1, { id: "1", employee_id: null, role: "admin", active: true, status: "" }],
    [2, { id: "2", employee_id: "10", role: "employee", active: true, status: "active" }],
    [3, { id: "3", employee_id: "20", role: "employee", active: true, status: "active" }],
  ]);
  queries = [];
  queryFailure = false;
  queryMock.mock.resetCalls();
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  mock.restoreAll();
  await pool.end();
});

function token(userId = 2, claims: Record<string, unknown> = {}, options: jwt.SignOptions = {}) {
  const account = accounts.get(userId)!;
  return jwt.sign({ role: account.role, employeeId: account.employee_id, ...claims },
    process.env.JWT_SECRET!, { subject: String(userId), expiresIn: "1h", ...options });
}
async function call(method: string, path: string, auth?: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(body === undefined || method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}

const managementRoutes = [
  ["GET", "/employees"], ["GET", "/employees/10"], ["POST", "/employees"],
  ["PUT", "/employees/10"], ["DELETE", "/employees/10"],
  ["PATCH", "/employees/10/reactivate"], ["DELETE", "/employees/10/permanent"],
  ["GET", "/departments"], ["GET", "/departments/1"], ["GET", "/departments/1/employees"],
  ["POST", "/departments"], ["PUT", "/departments/1"], ["DELETE", "/departments/1"],
  ["GET", "/settings"], ["PUT", "/settings"],
] as const;

for (const [method, path] of managementRoutes) {
  test(`${method} ${path}: anonymous denied without querying database`, async () => {
    assert.equal((await call(method, path)).status, 401);
    assert.equal(queries.length, 0);
  });
  test(`${method} ${path}: employee denied before controller`, async () => {
    assert.equal((await call(method, path, token(), { role: "admin", employeeId: 20 })).status, 403);
    assert.equal(queries.length, 1);
  });
}

test("active admin can list employees and departments", async () => {
  for (const path of ["/employees", "/departments"]) {
    const response = await call("GET", path, token(1));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, []);
  }
});

test("permanent deletion returns 409 to admins without touching employee history", async () => {
  for (const id of ["10", "999", "invalid"]) {
    queries = [];
    const response = await call("DELETE", `/employees/${id}/permanent`, token(1));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      success: false,
      message: "Permanent employee deletion is retired. Deactivate the employee instead to preserve their history.",
    });
    // Authentication is the only database query; pool.connect fails if invoked.
    assert.equal(queries.length, 1);
  }
});

test("employee cannot access admin attendance, leave approval, or dashboard", async () => {
  for (const [method, path] of [
    ["GET", "/attendance"], ["GET", "/attendance/statistics"],
    ["POST", "/attendance/manual"], ["PATCH", "/attendance/1"],
    ["GET", "/leaves"], ["PUT", "/leaves/100/status"], ["GET", "/dashboard/admin"],
  ]) assert.equal((await call(method!, path!, token())).status, 403);
});

test("invalid, expired, not-yet-valid, and unsupported algorithm tokens are denied", async () => {
  const invalidTokens = [
    "invalid", token(2, {}, { expiresIn: -1 }), token(2, {}, { notBefore: "1h" }),
    token(2, {}, { algorithm: "HS384" }),
    jwt.sign({ sub: "2", role: "employee", employeeId: 10 }, randomBytes(32)),
    jwt.sign({ sub: "2", role: "employee", employeeId: 10 }, process.env.JWT_SECRET!),
    token(2, { employeeId: true }), token(2, { employeeId: null }),
    token(2, { role: "super_admin" }), token(2, {}, { subject: "0" }),
    token(2, {}, { subject: "9007199254740993" }),
  ];
  for (const invalid of invalidTokens) assert.equal((await call("GET", "/attendance/today", invalid)).status, 401);
  assert.equal(queries.length, 0);
});

test("previously issued tokens stop working after deactivation, removal, or employment inactivation", async () => {
  const issued = token();
  accounts.get(2)!.active = false;
  assert.equal((await call("GET", "/attendance/today", issued)).status, 401);
  accounts.get(2)!.active = true;
  accounts.get(2)!.status = "inactive";
  assert.equal((await call("GET", "/leaves/me", issued)).status, 401);
  accounts.delete(2);
  assert.equal((await call("GET", "/profile", issued)).status, 401);
});

test("stale admin role and changed employee linkage invalidate issued tokens", async () => {
  const adminToken = token(1);
  accounts.get(1)!.role = "employee";
  accounts.get(1)!.employee_id = "30";
  accounts.get(1)!.status = "active";
  assert.equal((await call("GET", "/employees", adminToken)).status, 401);
  const employeeToken = token();
  accounts.get(2)!.employee_id = "20";
  assert.equal((await call("GET", "/attendance/today", employeeToken)).status, 401);
});

test("leave detail returns own record and hides another employee's record", async () => {
  assert.equal((await call("GET", "/leaves/100", token(2))).status, 200);
  assert.equal((await call("GET", "/leaves/100?employeeId=10", token(3))).status, 404);
});

test("attendance and leave history ignore arbitrary employee IDs", async () => {
  for (const path of ["/attendance/today?employeeId=20", "/attendance/my-history?employeeId=20", "/leaves/me?employeeId=20"]) {
    assert.equal((await call("GET", path, token())).status, 200);
    assert.equal(Number(queries.at(-1)!.values[0]), 10);
  }
});

test("profile mass assignment cannot change role or employment metadata", async () => {
  assert.equal((await call("PUT", "/profile", token(), { role: "admin", department_id: 99 })).status, 400);
  assert.ok(queries.every(({ sql }) => sql.startsWith("SELECT")));
});

test("database failure fails closed with a generic response", async () => {
  queryFailure = true;
  const response = await call("GET", "/employees", token(1));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { success: false, message: "An unexpected server error occurred" });
});
