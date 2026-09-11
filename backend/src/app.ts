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
import companySettingsRoutes from "./routes/companySettingsRoutes.js";
import importRoutes from "./routes/importRoutes.js";
import payrollRoutes from "./routes/payrollRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import exportRoutes from "./routes/exportRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";

import { authenticateToken } from "./middleware/authMiddleware.js";
import { authorizeRoles } from "./middleware/roleMiddleware.js";
import { createAttendanceRouter } from "./routes/attendanceRoutes.js";
import { profileImagesDirectory } from "./middleware/profileImageUpload.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    /**
     * Content-Disposition is not a CORS-safelisted response header, so without
     * this the browser hides it from JavaScript and every report export is
     * saved as the fallback filename instead of the one the server chose.
     */
    exposedHeaders: ["Content-Disposition"],
  }),
);

app.use(express.json());

app.use(
  "/uploads/profile-images",
  express.static(profileImagesDirectory, { dotfiles: "deny", index: false }),
);

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/departments", departmentRoutes);

app.use("/api/leaves", leaveRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/settings", companySettingsRoutes);
app.use("/api/import", importRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/team", teamRoutes);

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
  if (error?.type === "entity.parse.failed" && error.status === 400) {
    response.status(400).json({ success: false, message: "Send a valid JSON object." });
    return;
  }
  if (error?.type === "entity.too.large" && error.status === 413) {
    response.status(413).json({ success: false, message: "The request body is too large." });
    return;
  }
  console.error(error);

  response.status(500).json({
    success: false,
    message: "An unexpected server error occurred",
  });
};

app.use(errorHandler);

export default app;
