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

/**
 * Verifies the bearer token and rebuilds the session from the database.
 *
 * `allowPasswordChange` is the ONLY difference between the two middlewares
 * exported below. It is a parameter rather than a second implementation so the
 * token checks cannot drift apart between the restricted and unrestricted
 * paths.
 */
async function authenticate(
  request: Request,
  response: Response,
  next: NextFunction,
  allowPasswordChange: boolean,
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

    // Default deny. Every protected router in this application reaches here,
    // so an account owing a password change is refused everywhere except the
    // three endpoints that deliberately opt in below. A router added later is
    // covered without anyone remembering to cover it.
    //
    // The value comes from `findSessionUserById`, which reads the column on
    // every request, so an old token cannot assert a stale answer in either
    // direction.
    if (currentUser.mustChangePassword && !allowPasswordChange) {
      response.status(403).json({
        success: false,
        // A distinct code, so the client can route to the forced-change screen
        // rather than treating this as an ordinary permission failure.
        code: "PASSWORD_CHANGE_REQUIRED",
        message:
          "You must choose a new password before using the application.",
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

/**
 * The guard every protected route uses.
 *
 * An account still holding a temporary password is refused here, whatever its
 * role: an administrator whose account is flagged is no more exempt than an
 * employee.
 */
export async function authenticateToken(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  await authenticate(request, response, next, false);
}

/**
 * The same verification, minus the forced-change refusal.
 *
 * Reserved for the minimum an account needs in order to get out of that state:
 * read who it is, change its password, and sign out. Nothing else may use it.
 */
export async function authenticateForPasswordChange(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  await authenticate(request, response, next, true);
}
