import type { Request, Response } from "express";
import pool from "../config/db.js";
import bcrypt from "bcrypt";

export const getEmployees = async (request: Request, response: Response) => {
  try {
    const { search, department_id, employment_status } = request.query;

    const conditions: string[] = [];
    const values: string[] = [];

    if (search) {
      values.push(`%${String(search)}%`);
      conditions.push(`
    (
      e.full_name ILIKE $${values.length}
      OR e.employee_number ILIKE $${values.length}
    )
  `);
    }

    if (department_id) {
      values.push(String(department_id));
      conditions.push(`e.department_id = $${values.length}`);
    }

    if (employment_status) {
      values.push(String(employment_status));
      conditions.push(`e.employment_status = $${values.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `
      SELECT
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
        e.updated_at
      FROM employees e
      LEFT JOIN departments d
        ON e.department_id = d.id
      ${whereClause}
      ORDER BY e.id;
      `,
      values,
    );

    response.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      success: false,
      message: "Failed to fetch employees",
    });
  }
};

export const getEmployeeById = async (request: Request, response: Response) => {
  try {
    const { id } = request.params;

    const result = await pool.query(
      `
      SELECT
        e.*,
        d.name AS department_name
      FROM employees e
      LEFT JOIN departments d
      ON e.department_id = d.id
      WHERE e.id = $1;
      `,
      [id],
    );

    if (result.rows.length === 0) {
      response.status(404).json({
        success: false,
        message: "Employee not found",
      });

      return;
    }

    response.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      success: false,
      message: "Failed to fetch employee",
    });
  }
};

export const createEmployee = async (request: Request, response: Response) => {
  const client = await pool.connect();

  try {
    const {
      employee_number,
      full_name,
      email,
      temporary_password,
      phone,
      address,
      date_of_birth,
      gender,
      emergency_contact_name,
      emergency_contact_phone,
      job_title,
      department_id,
      employment_date,
      employment_status,
    } = request.body;

    // Basic validation
    if (!employee_number || !full_name || !email || !temporary_password) {
      response.status(400).json({
        success: false,
        message: "Employee number, name, email and password are required",
      });

      return;
    }

    const validStatuses = ["active", "inactive"];

    if (employment_status && !validStatuses.includes(employment_status)) {
      response.status(400).json({
        success: false,
        message: "Employment status must be active or inactive",
      });

      return;
    }

    if (!department_id) {
      response.status(400).json({
        success: false,
        message: "Department is required",
      });

      return;
    }

    await client.query("BEGIN");
    // Check department exists

    const departmentCheck = await client.query(
      `
  SELECT id
  FROM departments
  WHERE id = $1
  `,
      [department_id],
    );

    if (departmentCheck.rows.length === 0) {
      await client.query("ROLLBACK");

      response.status(404).json({
        success: false,
        message: "Department not found",
      });

      return;
    }

    // Check duplicate employee number

    const employeeCheck = await client.query(
      `
      SELECT id 
      FROM employees
      WHERE employee_number = $1
      `,
      [employee_number],
    );

    if (employeeCheck.rows.length > 0) {
      await client.query("ROLLBACK");

      response.status(409).json({
        success: false,
        message: "Employee number already exists",
      });

      return;
    }

    // Check duplicate email

    const emailCheck = await client.query(
      `
      SELECT id
      FROM users
      WHERE email = $1
      `,
      [email],
    );

    if (emailCheck.rows.length > 0) {
      await client.query("ROLLBACK");

      response.status(409).json({
        success: false,
        message: "Email already exists",
      });

      return;
    }

    // Create employee

    const employeeResult = await client.query(
      `
      INSERT INTO employees (
        employee_number,
        full_name,
        phone,
        address,
        date_of_birth,
        gender,
        emergency_contact_name,
        emergency_contact_phone,
        job_title,
        department_id,
        employment_date,
        employment_status
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
      )
      RETURNING *
      `,
      [
        employee_number,
        full_name,
        phone,
        address,
        date_of_birth,
        gender,
        emergency_contact_name,
        emergency_contact_phone,
        job_title,
        department_id,
        employment_date,
        employment_status ?? "active",
      ],
    );

    const employee = employeeResult.rows[0];

    // Hash password

    const passwordHash = await bcrypt.hash(temporary_password, 12);

    // Create user account

    await client.query(
      `
      INSERT INTO users (
        employee_id,
        email,
        password_hash,
        role,
        is_active
      )
      VALUES ($1,$2,$3,'employee',TRUE)
      `,
      [employee.id, email, passwordHash],
    );

    await client.query("COMMIT");

    response.status(201).json({
      success: true,
      message: "Employee created successfully",
      data: employee,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    response.status(500).json({
      success: false,
      message: "Failed to create employee",
    });
  } finally {
    client.release();
  }
};

export const updateEmployee = async (request: Request, response: Response) => {
  const client = await pool.connect();

  try {
    const { id } = request.params;

    const {
      full_name,
      email,
      phone,
      address,
      job_title,
      department_id,
      employment_status,
      emergency_contact_name,
      emergency_contact_phone,
    } = request.body;

    const validStatuses = ["active", "inactive"];

    if (employment_status && !validStatuses.includes(employment_status)) {
      response.status(400).json({
        success: false,
        message: "Employment status must be active or inactive",
      });

      return;
    }

    await client.query("BEGIN");
    if (department_id) {
      const departmentCheck = await client.query(
        `
    SELECT id
    FROM departments
    WHERE id = $1
    `,
        [department_id],
      );

      if (departmentCheck.rows.length === 0) {
        await client.query("ROLLBACK");

        response.status(404).json({
          success: false,
          message: "Department not found",
        });

        return;
      }
    }

    // Check employee exists

    const employeeCheck = await client.query(
      `
      SELECT id
      FROM employees
      WHERE id = $1
      `,
      [id],
    );

    if (employeeCheck.rows.length === 0) {
      await client.query("ROLLBACK");

      response.status(404).json({
        success: false,
        message: "Employee not found",
      });

      return;
    }

    // Update employee

    const employeeResult = await client.query(
      `
      UPDATE employees
      SET
        full_name = $1,
        phone = $2,
        address = $3,
        job_title = $4,
        department_id = $5,
        employment_status = $6,
        emergency_contact_name = $7,
        emergency_contact_phone = $8,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING *
      `,
      [
        full_name,
        phone,
        address,
        job_title,
        department_id,
        employment_status,
        emergency_contact_name,
        emergency_contact_phone,
        id,
      ],
    );

    // Update user email if provided

    if (email) {
      const emailCheck = await client.query(
        `
    SELECT id
    FROM users
    WHERE email = $1
      AND employee_id <> $2
    `,
        [email, id],
      );

      if (emailCheck.rows.length > 0) {
        await client.query("ROLLBACK");

        response.status(409).json({
          success: false,
          message: "Email already exists",
        });

        return;
      }

      await client.query(
        `
    UPDATE users
    SET
      email = $1,
      updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = $2
    `,
        [email, id],
      );
    }

    await client.query("COMMIT");

    response.status(200).json({
      success: true,
      message: "Employee updated successfully",
      data: employeeResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    response.status(500).json({
      success: false,
      message: "Failed to update employee",
    });
  } finally {
    client.release();
  }
};

export const deleteEmployee = async (request: Request, response: Response) => {
  const client = await pool.connect();

  try {
    const { id } = request.params;

    await client.query("BEGIN");

    // Check employee exists

    const employeeCheck = await client.query(
      `
      SELECT id
      FROM employees
      WHERE id = $1
      `,
      [id],
    );

    if (employeeCheck.rows.length === 0) {
      await client.query("ROLLBACK");

      response.status(404).json({
        success: false,
        message: "Employee not found",
      });

      return;
    }

    // Deactivate employee

    await client.query(
      `
      UPDATE employees
      SET
        employment_status = 'inactive',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [id],
    );

    // Disable login access

    await client.query(
      `
      UPDATE users
      SET
        is_active = FALSE,
        updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $1
      `,
      [id],
    );

    await client.query("COMMIT");

    response.status(200).json({
      success: true,
      message: "Employee deactivated successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    response.status(500).json({
      success: false,
      message: "Failed to deactivate employee",
    });
  } finally {
    client.release();
  }
};

export const permanentlyDeleteEmployee = async (
  request: Request,
  response: Response,
) => {
  const client = await pool.connect();

  try {
    const { id } = request.params;

    await client.query("BEGIN");

    // Check employee exists
    const employeeCheck = await client.query(
      `
      SELECT id, full_name
      FROM employees
      WHERE id = $1
      `,
      [id],
    );

    if (employeeCheck.rows.length === 0) {
      await client.query("ROLLBACK");

      response.status(404).json({
        success: false,
        message: "Employee not found",
      });

      return;
    }

    // Delete employee.
    // Related users, attendance and leave records
    // are removed automatically because of ON DELETE CASCADE.
    await client.query(
      `
      DELETE FROM employees
      WHERE id = $1
      `,
      [id],
    );

    await client.query("COMMIT");

    response.status(200).json({
      success: true,
      message: "Employee permanently deleted",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    response.status(500).json({
      success: false,
      message: "Failed to permanently delete employee",
    });
  } finally {
    client.release();
  }
};

export const reactivateEmployee = async (
  request: Request,
  response: Response,
) => {
  const client = await pool.connect();

  try {
    const { id } = request.params;

    await client.query("BEGIN");

    const employeeCheck = await client.query(
      `
      SELECT id
      FROM employees
      WHERE id = $1
      `,
      [id],
    );

    if (employeeCheck.rows.length === 0) {
      await client.query("ROLLBACK");

      response.status(404).json({
        success: false,
        message: "Employee not found",
      });

      return;
    }

    await client.query(
      `
      UPDATE employees
      SET
        employment_status = 'active',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [id],
    );

    await client.query(
      `
      UPDATE users
      SET
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $1
      `,
      [id],
    );

    await client.query("COMMIT");

    response.status(200).json({
      success: true,
      message: "Employee reactivated successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(error);

    response.status(500).json({
      success: false,
      message: "Failed to reactivate employee",
    });
  } finally {
    client.release();
  }
};
