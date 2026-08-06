import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import {
  findSafeUserById,
  findUserRecordByEmail,
} from "../utils/userQueries.js";

function getJwtConfiguration(): {
  secret: string;
  expiresIn: SignOptions["expiresIn"];
} {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return {
    secret,
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "8h") as SignOptions["expiresIn"],
  };
}

export async function login(request: Request, response: Response): Promise<void> {
  const email = typeof request.body.email === "string" ? request.body.email.trim() : "";
  const password = typeof request.body.password === "string" ? request.body.password : "";

  if (!email || !password) {
    response.status(400).json({
      success: false,
      message: "Email and password are required",
    });
    return;
  }

  const userRecord = await findUserRecordByEmail(email);

  if (!userRecord || !(await bcrypt.compare(password, userRecord.password_hash))) {
    response.status(401).json({
      success: false,
      message: "Invalid email or password",
    });
    return;
  }

  if (!userRecord.is_active) {
    response.status(403).json({
      success: false,
      message: "This account is inactive",
    });
    return;
  }

  const { secret, expiresIn } = getJwtConfiguration();
  const token = jwt.sign(
    { role: userRecord.role },
    secret,
    { subject: String(userRecord.id), expiresIn },
  );
  const user = await findSafeUserById(userRecord.id);

  response.status(200).json({
    success: true,
    message: "Login successful",
    data: { token, user },
  });
}

export async function getCurrentUser(
  request: Request,
  response: Response,
): Promise<void> {
  const user = await findSafeUserById(request.user!.id);

  if (!user) {
    response.status(401).json({
      success: false,
      message: "Authenticated user was not found",
    });
    return;
  }

  if (!user.isActive) {
    response.status(403).json({
      success: false,
      message: "This account is inactive",
    });
    return;
  }

  response.status(200).json({
    success: true,
    message: "Current user retrieved successfully",
    data: { user },
  });
}

export function logout(_request: Request, response: Response): void {
  response.status(200).json({
    success: true,
    message: "Logout successful. Remove the authentication token from the client.",
  });
}
