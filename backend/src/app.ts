import cors from "cors";
import express, { type Request, type Response } from "express";
import pool from "./config/db.js";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
  }),
);

app.use(express.json());

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

export default app;
