import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
} from "express";

import pool from "./config/db.js";

import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import employeeRoutes from "./routes/employeeRoutes.js";
import departmentRoutes from "./routes/departmentRoutes.js";
import leaveRoutes from "./routes/leaveRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";

import { authenticateToken } from "./middleware/authMiddleware.js";
import { authorizeRoles } from "./middleware/roleMiddleware.js";
import { createAttendanceRouter } from "./routes/attendanceRoutes.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
  }),
);

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/departments", departmentRoutes);

app.use("/api/leaves", leaveRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use(
  "/api/attendance",
  createAttendanceRouter({
    authenticate: authenticateToken,
    requireAdmin: authorizeRoles("admin"),
  }),
);

app.get("/api/health", (_request: Request, response: Response) => {
  response.status(200).json({
    success: true,
    message: "HR Nexus API is running",
  });
});

app.get(
  "/api/health/database",
  async (_request: Request, response: Response) => {
    try {
      const result = await pool.query<{ current_time: Date }>(
        "SELECT NOW() AS current_time",
      );

      response.status(200).json({
        success: true,
        message: "PostgreSQL is connected",
        databaseTime: result.rows[0]?.current_time,
      });
    } catch (error) {
      console.error(error);

      response.status(500).json({
        success: false,
        message: "PostgreSQL connection failed",
      });
    }
  },
);

app.use((_request: Request, response: Response) => {
  response.status(404).json({
    success: false,
    message: "API endpoint not found",
  });
});

const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  console.error(error);

  response.status(500).json({
    success: false,
    message: "An unexpected server error occurred",
  });
};

app.use(errorHandler);

export default app;
