import type { Request, Response } from "express";
import pool from "../config/db.js";
import { actorFromUser, recordAudit } from "../services/auditService.js";
import { diffChanges } from "../utils/auditRedaction.js";
import { eligibleEmploymentStatuses, parseIdParam } from "../utils/employeeValidation.js";

const NAME_MAX = 100;
const DESCRIPTION_MAX = 2000;

function databaseErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null
    ? (error as { code?: string }).code
    : undefined;
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
  });
}

/**
 * Department write contract. Non-string input previously reached `.trim()` and
 * produced a 500; every unexpected type is now a predictable 400.
 */
function validateDepartment(
  input: unknown,
): { valid: true; name: string; description: string | null } | { valid: false; errors: Record<string, string> } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: { _form: "Send a department object." } };
  }

  const value = input as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const unsupported = Object.keys(value).filter(
    (key) => !["name", "description"].includes(key),
  );
  if (unsupported.length > 0) {
    errors._form = `The request contains unsupported fields: ${unsupported.sort().join(", ")}.`;
  }

  let name = "";
  if (typeof value.name !== "string") {
    errors.name = "Department name is required.";
  } else {
    name = value.name.trim();
    if (!name || name.length > NAME_MAX || hasControlCharacters(name)) {
      errors.name = `Enter 1–${NAME_MAX} characters without control characters.`;
    }
  }

  let description: string | null = null;
  if (value.description !== undefined && value.description !== null) {
    if (typeof value.description !== "string") {
      errors.description = "Enter text, or null to clear the description.";
    } else {
      const cleaned = value.description.trim();
      if (cleaned.length > DESCRIPTION_MAX || hasControlCharacters(cleaned)) {
        errors.description = `Enter up to ${DESCRIPTION_MAX} characters without control characters.`;
      } else {
        description = cleaned || null;
      }
    }
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, name, description };
}

/**
 * Headcounts are aggregated in SQL so the department list never has to download
 * the entire employee table to display a count.
 */
export const getDepartments = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
         d.id,
         d.name,
         d.description,
         d.created_at,
         d.updated_at,
         count(e.id)::int AS employee_count,
         count(e.id) FILTER (
           WHERE e.employment_status = ANY($1::text[])
         )::int AS active_employee_count
       FROM departments d
       LEFT JOIN employees e ON e.department_id = d.id
       GROUP BY d.id
       ORDER BY d.id ASC`,
      [eligibleEmploymentStatuses],
    );

    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ success: false, message: "Failed to fetch departments" });
  }
};

export const getDepartmentById = async (req: Request, res: Response) => {
  const id = parseIdParam(req.params.id);

  if (id === null) {
    res.status(400).json({ success: false, message: "Invalid department ID" });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT
         d.id,
         d.name,
         d.description,
         d.created_at,
         d.updated_at,
         count(e.id)::int AS employee_count,
         count(e.id) FILTER (
           WHERE e.employment_status = ANY($2::text[])
         )::int AS active_employee_count
       FROM departments d
       LEFT JOIN employees e ON e.department_id = d.id
       WHERE d.id = $1
       GROUP BY d.id`,
      [id, eligibleEmploymentStatuses],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "Department not found" });
      return;
    }

    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("Error fetching department:", error);
    res.status(500).json({ success: false, message: "Failed to fetch department" });
  }
};

/**
 * Complete department membership, including inactive staff. Deliberately not
 * paginated: the department detail page counts on receiving every assigned
 * employee rather than a silently truncated first page.
 */
export const getDepartmentEmployees = async (req: Request, res: Response) => {
  const id = parseIdParam(req.params.id);

  if (id === null) {
    res.status(400).json({ success: false, message: "Invalid department ID" });
    return;
  }

  try {
    const department = await pool.query("SELECT id FROM departments WHERE id = $1", [id]);

    if (department.rows.length === 0) {
      res.status(404).json({ success: false, message: "Department not found" });
      return;
    }

    const employees = await pool.query(
      `SELECT id, employee_number, full_name, phone, job_title,
              employment_date, employment_status
       FROM employees
       WHERE department_id = $1
       ORDER BY id ASC`,
      [id],
    );

    res.status(200).json({ success: true, data: employees.rows });
  } catch (error) {
    console.error("Error fetching department employees:", error);
    res.status(500).json({ success: false, message: "Failed to fetch department employees" });
  }
};

export const createDepartment = async (req: Request, res: Response) => {
  const validation = validateDepartment(req.body);

  if (!validation.valid) {
    res.status(400).json({
      success: false,
      message: "Check the highlighted department fields.",
      errors: validation.errors,
    });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO departments (name, description)
       VALUES ($1, $2)
       RETURNING id, name, description, created_at, updated_at,
                 0 AS employee_count, 0 AS active_employee_count`,
      [validation.name, validation.description],
    );

    const created = result.rows[0];
    await recordAudit({
      actor: actorFromUser(req.user, req.user?.email),
      action: "DEPARTMENT_CREATED",
      entityType: "department",
      entityId: created.id,
      summary: `Created department ${created.name}`,
      changes: { name: created.name, description: created.description },
    });

    res.status(201).json({
      success: true,
      message: "Department created successfully",
      data: created,
    });
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      res.status(409).json({ success: false, message: "Department name already exists" });
      return;
    }

    console.error("Error creating department:", error);
    res.status(500).json({ success: false, message: "Failed to create department" });
  }
};

export const updateDepartment = async (req: Request, res: Response) => {
  const id = parseIdParam(req.params.id);

  if (id === null) {
    res.status(400).json({ success: false, message: "Invalid department ID" });
    return;
  }

  const validation = validateDepartment(req.body);

  if (!validation.valid) {
    res.status(400).json({
      success: false,
      message: "Check the highlighted department fields.",
      errors: validation.errors,
    });
    return;
  }

  try {
    // RETURNING gives the new row; the old values come from the same statement so
    // the audit diff needs no second round trip and cannot race the update.
    const result = await pool.query(
      `UPDATE departments d
       SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
       FROM (SELECT id, name, description FROM departments WHERE id = $3) AS prior
       WHERE d.id = $3
       RETURNING d.id, d.name, d.description, d.created_at, d.updated_at,
                 prior.name AS prior_name, prior.description AS prior_description`,
      [validation.name, validation.description, id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: "Department not found" });
      return;
    }

    const { prior_name, prior_description, ...department } = result.rows[0];

    await recordAudit({
      actor: actorFromUser(req.user, req.user?.email),
      action: "DEPARTMENT_UPDATED",
      entityType: "department",
      entityId: department.id,
      summary: `Updated department ${department.name}`,
      changes: diffChanges(
        { name: prior_name, description: prior_description },
        { name: department.name, description: department.description },
      ),
    });

    res.status(200).json({
      success: true,
      message: "Department updated successfully",
      data: department,
    });
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      res.status(409).json({ success: false, message: "Department name already exists" });
      return;
    }

    console.error("Error updating department:", error);
    res.status(500).json({ success: false, message: "Failed to update department" });
  }
};

/**
 * Deletion keeps the assigned-employee guard, and treats the database foreign key
 * as the authority. An employee assigned between the check and the delete now
 * produces the same 409 as the check itself instead of a 500; assigned employees
 * and their history are never removed.
 */
export const deleteDepartment = async (request: Request, response: Response) => {
  const id = parseIdParam(request.params.id);

  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid department ID" });
    return;
  }

  try {
    const deleted = await pool.query(
      `DELETE FROM departments
       WHERE id = $1
         AND NOT EXISTS (SELECT 1 FROM employees WHERE department_id = $1)
       RETURNING id, name`,
      [id],
    );

    if (deleted.rows.length > 0) {
      await recordAudit({
        actor: actorFromUser(request.user, request.user?.email),
        action: "DEPARTMENT_DELETED",
        entityType: "department",
        entityId: id,
        summary: `Deleted department ${deleted.rows[0].name}`,
        changes: { name: deleted.rows[0].name },
      });

      response.status(200).json({ success: true, message: "Department deleted successfully" });
      return;
    }

    const department = await pool.query("SELECT id FROM departments WHERE id = $1", [id]);

    if (department.rows.length === 0) {
      response.status(404).json({ success: false, message: "Department not found" });
      return;
    }

    response.status(409).json({
      success: false,
      message: "Cannot delete department while employees are assigned to it",
    });
  } catch (error) {
    if (databaseErrorCode(error) === "23503") {
      response.status(409).json({
        success: false,
        message: "Cannot delete department while employees are assigned to it",
      });
      return;
    }

    console.error("Error deleting department:", error);
    response.status(500).json({ success: false, message: "Failed to delete department" });
  }
};
