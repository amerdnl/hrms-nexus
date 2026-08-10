import type { Request, Response } from "express";
import pool from "../config/db.js";

export const getDepartments = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        name,
        description,
        created_at,
        updated_at
       FROM departments
       ORDER BY id ASC`,
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching departments:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch departments",
    });
  }
};

export const getDepartmentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        id,
        name,
        description,
        created_at,
        updated_at
       FROM departments
       WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Department not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching department:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch department",
    });
  }
};

export const getDepartmentEmployees = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const departmentResult = await pool.query(
      `SELECT id, name
       FROM departments
       WHERE id = $1`,
      [id],
    );

    if (departmentResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Department not found",
      });
      return;
    }

    const employeeResult = await pool.query(
      `SELECT
        id,
        employee_number,
        full_name,
        phone,
        job_title,
        employment_date,
        employment_status
       FROM employees
       WHERE department_id = $1
       ORDER BY id ASC`,
      [id],
    );

    res.status(200).json({
      success: true,
      data: employeeResult.rows,
    });
  } catch (error) {
    console.error("Error fetching department employees:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch department employees",
    });
  }
};

export const createDepartment = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({
        success: false,
        message: "Department name is required",
      });
      return;
    }

    const result = await pool.query(
      `INSERT INTO departments (name, description)
       VALUES ($1, $2)
       RETURNING
         id,
         name,
         description,
         created_at,
         updated_at`,
      [name.trim(), description?.trim() || null],
    );

    res.status(201).json({
      success: true,
      message: "Department created successfully",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("Error creating department:", error);

    if (error.code === "23505") {
      res.status(409).json({
        success: false,
        message: "Department name already exists",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Failed to create department",
    });
  }
};

export const updateDepartment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({
        success: false,
        message: "Department name is required",
      });
      return;
    }

    const result = await pool.query(
      `UPDATE departments
       SET
         name = $1,
         description = $2,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING
         id,
         name,
         description,
         created_at,
         updated_at`,
      [name.trim(), description?.trim() || null, id],
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: "Department not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Department updated successfully",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("Error updating department:", error);

    if (error.code === "23505") {
      res.status(409).json({
        success: false,
        message: "Department name already exists",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Failed to update department",
    });
  }
};

export const deleteDepartment = async (
  request: Request,
  response: Response,
) => {
  try {
    const { id } = request.params;

    // Check whether department exists
    const departmentCheck = await pool.query(
      `
      SELECT id
      FROM departments
      WHERE id = $1
      `,
      [id],
    );

    if (departmentCheck.rows.length === 0) {
      response.status(404).json({
        success: false,
        message: "Department not found",
      });

      return;
    }

    // Check whether employees are assigned to this department
    const employeeCheck = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM employees
      WHERE department_id = $1
      `,
      [id],
    );

    const employeeCount = employeeCheck.rows[0].count;

    if (employeeCount > 0) {
      response.status(409).json({
        success: false,
        message: "Cannot delete department while employees are assigned to it",
      });

      return;
    }

    // Delete department
    await pool.query(
      `
      DELETE FROM departments
      WHERE id = $1
      `,
      [id],
    );

    response.status(200).json({
      success: true,
      message: "Department deleted successfully",
    });
  } catch (error) {
    console.error(error);

    response.status(500).json({
      success: false,
      message: "Failed to delete department",
    });
  }
};
