import type { Request, Response } from "express";

export const getDepartments = (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Department route working",
  });
};

export const getDepartmentById = (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Department detail route working",
  });
};

export const getDepartmentEmployees = (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Department employees route working",
  });
};

export const createDepartment = (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Create department route working",
  });
};

export const updateDepartment = (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Update department route working",
  });
};

export const deleteDepartment = (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Delete department route working",
  });
};
