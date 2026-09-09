import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { AuthenticatedUser, UserRole } from "../types/auth.js";
import { findSessionUserById } from "../utils/userQueries.js";

interface TokenPayload extends jwt.JwtPayload {
  sub: string;
  role: UserRole;
  employeeId: number | string | null;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
}

export async function authenticateToken(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    response.status(401).json({
      success: false,
      message: "Authentication token is required",
    });
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    response.status(401).json({
      success: false,
      message: "Authentication token is required",
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
    }) as TokenPayload;

    if (typeof decoded !== "object" || decoded === null) {
      throw new jwt.JsonWebTokenError("Invalid token payload");
    }

    const userId = Number(decoded.sub);

    const employeeId =
      decoded.employeeId === null || decoded.employeeId === undefined
        ? null
        : Number(decoded.employeeId);

    const hasValidEmployeeId =
      employeeId === null ||
      (
        (typeof decoded.employeeId === "number" ||
          (typeof decoded.employeeId === "string" &&
            /^[1-9]\d*$/.test(decoded.employeeId))) &&
        Number.isSafeInteger(employeeId) &&
        employeeId > 0
      );

    if (
      typeof decoded.sub !== "string" ||
      !/^[1-9]\d*$/.test(decoded.sub) ||
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      typeof decoded.exp !== "number" ||
      !Number.isFinite(decoded.exp) ||
      !["admin", "employee"].includes(decoded.role) ||
      !hasValidEmployeeId ||
      (decoded.role === "employee" && employeeId === null)
    ) {
      throw new jwt.JsonWebTokenError("Invalid token payload");
    }

    // Only the claims the token itself carries. Deliberately not an
    // AuthenticatedUser: the email on the session user comes from the database,
    // never from the token, so it must not be constructible from claims here.
    const claimed: Pick<AuthenticatedUser, "id" | "employeeId" | "role"> = {
      id: userId,
      employeeId,
      role: decoded.role,
    };

    const currentUser = await findSessionUserById(userId);
    if (
      !currentUser ||
      currentUser.role !== claimed.role ||
      currentUser.employeeId !== claimed.employeeId
    ) {
      response.status(401).json({
        success: false,
        message: "Your session is no longer valid. Please sign in again.",
      });
      return;
    }

    request.user = currentUser;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      response.status(401).json({
        success: false,
        message: "Authentication token has expired",
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      response.status(401).json({
        success: false,
        message: "Authentication token is invalid",
      });
      return;
    }

    next(error);
  }
}
