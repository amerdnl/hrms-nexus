import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { AuthenticatedUser, UserRole } from "../types/auth.js";

interface TokenPayload extends jwt.JwtPayload {
  sub: string;
  role: UserRole;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
}

export function authenticateToken(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
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
    const decoded = jwt.verify(token, getJwtSecret()) as TokenPayload;
    const userId = Number(decoded.sub);

    if (!Number.isInteger(userId) || !["admin", "employee"].includes(decoded.role)) {
      throw new jwt.JsonWebTokenError("Invalid token payload");
    }

    const authenticatedUser: AuthenticatedUser = {
      id: userId,
      role: decoded.role,
    };
    request.user = authenticatedUser;
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
