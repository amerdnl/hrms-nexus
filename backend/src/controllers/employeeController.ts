import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../config/db.js";
import { actorFromUser, recordAudit } from "../services/auditService.js";
import { diffChanges } from "../utils/auditRedaction.js";
import {
  isEmployeeAccountActive,
  parseEmployeeListQuery,
  parseIdParam,
  validateEmployeeCreate,
  validateEmployeeUpdate,
  type EmployeeFieldValues,
} from "../utils/employeeValidation.js";

const employeeColumns = `
  e.id,
  e.employee_number,
  e.full_name,
  e.phone,
  e.address,
  e.date_of_birth,
  e.gender,
  e.emergency_contact_name,
  e.emergency_contact_phone,
  e.job_title,
  e.department_id,
  d.name AS department_name,
  e.employment_date,
  e.employment_status,
  e.profile_image,
  e.created_at,
  e.updated_at`;

// Both indexes protect the same account identity; either violation is a conflict
// for the caller, never a 500.
const emailConflictConstraints = new Set([
  "users_email_normalized_key",
  "users_email_key",
]);

function databaseErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null
    ? (error as { code?: string }).code
    : undefined;
}

function constraintName(error: unknown): string | undefined {
  return typeof error === "object" && error !== null
    ? (error as { constraint?: string }).constraint
    : undefined;
}

/** Rolls back without masking the original failure with a cleanup error. */
async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The transaction is already lost; the caller's response still stands.
  }
}

export const getEmployees = async (request: Request, response: Response) => {
  const parsed = parseEmployeeListQuery(request.query as Record<string, unknown>);

  if (!parsed.valid) {
    response.status(400).json({
      success: false,
      message: "Check the employee filters.",
      errors: parsed.errors,
    });
    return;
  }

  const query = parsed.data;
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (query.search) {
    // Email is part of the searchable identity, so the join is required here.
    values.push(`%${query.search}%`);
    conditions.push(`(
      e.full_name ILIKE $${values.length}
      OR e.employee_number ILIKE $${values.length}
      OR u.email ILIKE $${values.length}
    )`);
  }

  if (query.departmentId !== null) {
    values.push(query.departmentId);
    conditions.push(`e.department_id = $${values.length}`);
  } else if (query.departmentName !== null) {
    values.push(`%${query.departmentName}%`);
    conditions.push(`d.name ILIKE $${values.length}`);
  }

  if (query.employmentStatus !== null) {
    values.push(query.employmentStatus);
    conditions.push(`e.employment_status = $${values.length}`);
  }

  if (query.jobTitle !== null) {
    values.push(query.jobTitle);
    conditions.push(`e.job_title = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  let limitClause = "";
  if (query.paginated) {
    values.push(query.pageSize);
    limitClause += ` LIMIT $${values.length}`;
    values.push((query.page - 1) * query.pageSize);
    limitClause += ` OFFSET $${values.length}`;
  }

  try {
    const result = await pool.query<Record<string, unknown> & { total_count: string }>(
      `SELECT ${employeeColumns}, count(*) OVER() AS total_count
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN users u ON u.employee_id = e.id
       ${whereClause}
       ORDER BY e.id${limitClause}`,
      values,
    );

    // count(*) OVER() disappears with the rows, so an out-of-range page needs a
    // separate total rather than reporting zero results overall.
    let total = Number(result.rows[0]?.total_count ?? 0);
    if (query.paginated && result.rows.length === 0) {
      const totals = await pool.query<{ total: string }>(
        `SELECT count(*)::text AS total
         FROM employees e
         LEFT JOIN departments d ON e.department_id = d.id
         LEFT JOIN users u ON u.employee_id = e.id
         ${whereClause}`,
        values.slice(0, values.length - 2),
      );
      total = Number(totals.rows[0]?.total ?? 0);
    }

    const data = result.rows.map(({ total_count: _ignored, ...employee }) => employee);

    response.status(200).json({
      success: true,
      data,
      pagination: {
        page: query.paginated ? query.page : 1,
        page_size: query.paginated ? query.pageSize : total,
        total,
        page_count: query.paginated ? Math.max(1, Math.ceil(total / query.pageSize)) : 1,
      },
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    response.status(500).json({ success: false, message: "Failed to fetch employees" });
  }
};

/**
 * Complete, lightweight directory for consumers that must resolve every employee
 * a record can reference — the attendance join and its department filter. It is
 * deliberately not paginated so those consumers cannot silently drop rows.
 */
export const getEmployeeLookup = async (_request: Request, response: Response) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.employee_number, e.full_name, e.job_title,
              e.department_id, d.name AS department_name, e.employment_status
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       ORDER BY e.full_name ASC, e.id ASC`,
    );

    response.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error fetching employee lookup:", error);
    response.status(500).json({ success: false, message: "Failed to fetch employee directory" });
  }
};

/** Distinct job titles for the list filter, so the options are not limited to one page. */
export const getEmployeeJobTitles = async (_request: Request, response: Response) => {
  try {
    const result = await pool.query<{ job_title: string }>(
      `SELECT DISTINCT job_title
       FROM employees
       WHERE job_title IS NOT NULL AND btrim(job_title) <> ''
       ORDER BY job_title ASC`,
    );

    response.status(200).json({
      success: true,
      data: result.rows.map((row) => row.job_title),
    });
  } catch (error) {
    console.error("Error fetching job titles:", error);
    response.status(500).json({ success: false, message: "Failed to fetch job titles" });
  }
};

export const getEmployeeById = async (request: Request, response: Response) => {
  const id = parseIdParam(request.params.id);

  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid employee ID" });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT ${employeeColumns}, u.email
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN users u ON u.employee_id = e.id
       WHERE e.id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      response.status(404).json({ success: false, message: "Employee not found" });
      return;
    }

    response.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error fetching employee:", error);
    response.status(500).json({ success: false, message: "Failed to fetch employee" });
  }
};

export const createEmployee = async (request: Request, response: Response) => {
  const validation = validateEmployeeCreate(request.body);

  if (!validation.valid) {
    response.status(400).json({
      success: false,
      message: "Check the highlighted employee fields.",
      errors: validation.errors,
    });
    return;
  }

  const employee = validation.data;
  let client: PoolClient;

  try {
    client = await pool.connect();
  } catch (error) {
    console.error("Employee create could not acquire a connection:", error);
    response.status(503).json({
      success: false,
      message: "The database is temporarily unavailable. Please try again.",
    });
    return;
  }

  try {
    // Hashing is slow, so it happens before the transaction opens rather than
    // holding row locks for the duration of a bcrypt round.
    const passwordHash = await bcrypt.hash(employee.temporary_password!, 12);

    await client.query("BEGIN");

    const department = await client.query(
      "SELECT id FROM departments WHERE id = $1",
      [employee.department_id],
    );

    if (department.rows.length === 0) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Department not found" });
      return;
    }

    const duplicateNumber = await client.query(
      "SELECT id FROM employees WHERE employee_number = $1",
      [employee.employee_number],
    );

    if (duplicateNumber.rows.length > 0) {
      await safeRollback(client);
      response.status(409).json({ success: false, message: "Employee number already exists" });
      return;
    }

    // Matches the normalized unique index, so the pre-check and the database
    // agree on what counts as the same account.
    const duplicateEmail = await client.query(
      "SELECT id FROM users WHERE lower(btrim(email)) = lower(btrim($1))",
      [employee.email],
    );

    if (duplicateEmail.rows.length > 0) {
      await safeRollback(client);
      response.status(409).json({ success: false, message: "Email already exists" });
      return;
    }

    const created = await client.query(
      `INSERT INTO employees (
         employee_number, full_name, phone, address, date_of_birth, gender,
         emergency_contact_name, emergency_contact_phone, job_title,
         department_id, employment_date, employment_status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        employee.employee_number,
        employee.full_name,
        employee.phone ?? null,
        employee.address ?? null,
        employee.date_of_birth ?? null,
        employee.gender ?? null,
        employee.emergency_contact_name ?? null,
        employee.emergency_contact_phone ?? null,
        employee.job_title ?? null,
        employee.department_id,
        employee.employment_date ?? null,
        employee.employment_status,
      ],
    );

    const record = created.rows[0];

    // Account activity is derived from employment status, so an employee created
    // as inactive/resigned/terminated does not receive a usable sign-in.
    await client.query(
      `INSERT INTO users (employee_id, email, password_hash, role, is_active)
       VALUES ($1,$2,$3,'employee',$4)`,
      [
        record.id,
        employee.email,
        passwordHash,
        isEmployeeAccountActive(employee.employment_status!),
      ],
    );

    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "EMPLOYEE_CREATED",
      entityType: "employee",
      entityId: record.id,
      summary: `Created employee ${record.employee_number} (${record.full_name})`,
      changes: {
        employee_number: record.employee_number,
        full_name: record.full_name,
        department_id: record.department_id,
        employment_status: record.employment_status,
        job_title: record.job_title,
      },
    }, client);

    await client.query("COMMIT");

    response.status(201).json({
      success: true,
      message: "Employee created successfully",
      data: record,
    });
  } catch (error) {
    await safeRollback(client);
    const code = databaseErrorCode(error);

    if (code === "23505" && emailConflictConstraints.has(constraintName(error) ?? "")) {
      response.status(409).json({ success: false, message: "Email already exists" });
      return;
    }

    if (code === "23505" && constraintName(error) === "employees_employee_number_key") {
      response.status(409).json({ success: false, message: "Employee number already exists" });
      return;
    }

    if (code === "23503") {
      response.status(404).json({ success: false, message: "Department not found" });
      return;
    }

    console.error("Error creating employee:", error);
    response.status(500).json({ success: false, message: "Failed to create employee" });
  } finally {
    client.release();
  }
};

/**
 * Applies employment status and linked account activity together, under the same
 * lock order used by every lifecycle path (employees, then users), so a competing
 * edit/deactivate/reactivate serializes instead of leaving a mismatched account.
 */
async function applyLifecycle(
  client: PoolClient,
  employeeId: number,
  status: string,
): Promise<void> {
  await client.query(
    `UPDATE employees
     SET employment_status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [status, employeeId],
  );

  await client.query(
    `UPDATE users
     SET is_active = $1, updated_at = CURRENT_TIMESTAMP
     WHERE employee_id = $2`,
    [isEmployeeAccountActive(status), employeeId],
  );
}

/** Locks the employee row and its linked account in a fixed order. */
async function lockEmployee(
  client: PoolClient,
  employeeId: number,
): Promise<{
  found: boolean;
  employmentStatus?: string;
  userId?: number | null;
  before?: Record<string, unknown>;
}> {
  // The whole row, not just the status: an audit entry has to say what actually
  // changed, and that needs the values as they were before the write.
  const employee = await client.query<Record<string, unknown> & { employment_status: string }>(
    "SELECT * FROM employees WHERE id = $1 FOR UPDATE",
    [employeeId],
  );

  const row = employee.rows[0];
  if (!row) return { found: false };

  const account = await client.query<{ id: number }>(
    "SELECT id FROM users WHERE employee_id = $1 FOR UPDATE",
    [employeeId],
  );

  return {
    found: true,
    employmentStatus: row.employment_status,
    userId: account.rows[0]?.id ?? null,
    before: row,
  };
}

const updatableColumns: Array<keyof EmployeeFieldValues> = [
  "full_name", "phone", "address", "date_of_birth", "gender",
  "emergency_contact_name", "emergency_contact_phone", "job_title",
  "department_id", "employment_date",
];

export const updateEmployee = async (request: Request, response: Response) => {
  const id = parseIdParam(request.params.id);

  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid employee ID" });
    return;
  }

  const validation = validateEmployeeUpdate(request.body);

  if (!validation.valid) {
    response.status(400).json({
      success: false,
      message: "Check the highlighted employee fields.",
      errors: validation.errors,
    });
    return;
  }

  const employee = validation.data;
  let client: PoolClient;

  try {
    client = await pool.connect();
  } catch (error) {
    console.error("Employee update could not acquire a connection:", error);
    response.status(503).json({
      success: false,
      message: "The database is temporarily unavailable. Please try again.",
    });
    return;
  }

  try {
    await client.query("BEGIN");

    const locked = await lockEmployee(client, id);

    if (!locked.found) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Employee not found" });
      return;
    }

    const department = await client.query(
      "SELECT id FROM departments WHERE id = $1",
      [employee.department_id],
    );

    if (department.rows.length === 0) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Department not found" });
      return;
    }

    if (employee.email !== undefined) {
      if (locked.userId === null) {
        await safeRollback(client);
        response.status(409).json({
          success: false,
          message: "This employee has no linked user account, so their email cannot be changed.",
        });
        return;
      }

      // Excluding by the linked account's own ID also covers standalone admin
      // accounts, which an employee_id comparison silently skipped.
      const duplicate = await client.query(
        "SELECT id FROM users WHERE lower(btrim(email)) = lower(btrim($1)) AND id <> $2",
        [employee.email, locked.userId],
      );

      if (duplicate.rows.length > 0) {
        await safeRollback(client);
        response.status(409).json({ success: false, message: "Email already exists" });
        return;
      }

      await client.query(
        "UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [employee.email, locked.userId],
      );
    }

    const assignments: string[] = [];
    const values: unknown[] = [];

    for (const column of updatableColumns) {
      if (employee[column] === undefined) continue;
      values.push(employee[column]);
      assignments.push(`${column} = $${values.length}`);
    }

    values.push(employee.employment_status);
    assignments.push(`employment_status = $${values.length}`);
    assignments.push("updated_at = CURRENT_TIMESTAMP");

    values.push(id);
    const updated = await client.query(
      `UPDATE employees SET ${assignments.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values,
    );

    // Keep the linked account consistent with the status just written.
    await client.query(
      "UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE employee_id = $2",
      [isEmployeeAccountActive(employee.employment_status!), id],
    );

    const after = updated.rows[0];
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "EMPLOYEE_UPDATED",
      entityType: "employee",
      entityId: id,
      summary: `Updated employee ${after.employee_number} (${after.full_name})`,
      changes: diffChanges(locked.before ?? null, after, [
        ...updatableColumns, "employment_status",
      ]),
    }, client);

    await client.query("COMMIT");

    response.status(200).json({
      success: true,
      message: "Employee updated successfully",
      data: after,
    });
  } catch (error) {
    await safeRollback(client);
    const code = databaseErrorCode(error);

    if (code === "23505" && emailConflictConstraints.has(constraintName(error) ?? "")) {
      response.status(409).json({ success: false, message: "Email already exists" });
      return;
    }

    if (code === "23503") {
      response.status(404).json({ success: false, message: "Department not found" });
      return;
    }

    console.error("Error updating employee:", error);
    response.status(500).json({ success: false, message: "Failed to update employee" });
  } finally {
    client.release();
  }
};

export const deleteEmployee = async (request: Request, response: Response) => {
  await changeLifecycle(request, response, {
    status: "inactive",
    successMessage: "Employee deactivated successfully",
    failureMessage: "Failed to deactivate employee",
    action: "EMPLOYEE_DEACTIVATED",
  });
};

export const reactivateEmployee = async (request: Request, response: Response) => {
  await changeLifecycle(request, response, {
    status: "active",
    successMessage: "Employee reactivated successfully",
    failureMessage: "Failed to reactivate employee",
    action: "EMPLOYEE_REACTIVATED",
  });
};

async function changeLifecycle(
  request: Request,
  response: Response,
  options: {
    status: string;
    successMessage: string;
    failureMessage: string;
    action: "EMPLOYEE_DEACTIVATED" | "EMPLOYEE_REACTIVATED";
  },
) {
  const id = parseIdParam(request.params.id);

  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid employee ID" });
    return;
  }

  let client: PoolClient;

  try {
    client = await pool.connect();
  } catch (error) {
    console.error("Employee lifecycle change could not acquire a connection:", error);
    response.status(503).json({
      success: false,
      message: "The database is temporarily unavailable. Please try again.",
    });
    return;
  }

  try {
    await client.query("BEGIN");

    const locked = await lockEmployee(client, id);

    if (!locked.found) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Employee not found" });
      return;
    }

    await applyLifecycle(client, id, options.status);

    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: options.action,
      entityType: "employee",
      entityId: id,
      summary: `${options.successMessage.replace(" successfully", "")}: ${
        locked.before?.employee_number ?? `employee #${id}`}`,
      changes: {
        employment_status: { before: locked.employmentStatus ?? null, after: options.status },
      },
    }, client);

    await client.query("COMMIT");

    response.status(200).json({ success: true, message: options.successMessage });
  } catch (error) {
    await safeRollback(client);
    console.error(`${options.failureMessage}:`, error);
    response.status(500).json({ success: false, message: options.failureMessage });
  } finally {
    client.release();
  }
}

export const permanentlyDeleteEmployee = (
  _request: Request,
  response: Response,
) => {
  response.status(409).json({
    success: false,
    message:
      "Permanent employee deletion is retired. Deactivate the employee instead to preserve their history.",
  });
};
