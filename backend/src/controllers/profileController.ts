import bcrypt from "bcrypt";
import { actorFromUser, recordAudit } from "../services/auditService.js";
import { unlink } from "node:fs/promises";
import path from "node:path";
import type { Request, Response } from "express";
import pool from "../config/db.js";
import {
  profileImagesDirectory,
  profileImageUrlPrefix,
} from "../middleware/profileImageUpload.js";
import {
  findSafeUserById,
  findUserRecordById,
} from "../utils/userQueries.js";

const editableFieldColumns = {
  phone: "phone",
  address: "address",
  emergency_contact_name: "emergency_contact_name",
  emergency_contact_phone: "emergency_contact_phone",
} as const;

const restrictedFields = new Set([
  "employee_number",
  "email",
  "role",
  "full_name",
  "job_title",
  "department_id",
  "employment_date",
  "employment_status",
  "profile_image",
]);

async function removeManagedProfileImage(imagePath: string | null): Promise<void> {
  if (!imagePath?.startsWith(profileImageUrlPrefix)) return;

  const filename = imagePath.slice(profileImageUrlPrefix.length);
  if (!filename || filename !== path.basename(filename)) return;

  const filePath = path.resolve(profileImagesDirectory, filename);
  if (path.dirname(filePath) !== profileImagesDirectory) return;

  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Unable to remove managed profile image:", error);
    }
  }
}

async function requireActiveUser(request: Request, response: Response) {
  const user = await findUserRecordById(request.user!.id);

  if (!user || !user.is_active) {
    response.status(403).json({
      success: false,
      message: "The authenticated account is unavailable or inactive",
    });
    return null;
  }

  return user;
}

export async function getProfile(request: Request, response: Response): Promise<void> {
  const activeUser = await requireActiveUser(request, response);
  if (!activeUser) return;

  const user = await findSafeUserById(activeUser.id);

  response.status(200).json({
    success: true,
    message: "Profile retrieved successfully",
    data: { user },
  });
}

export async function updateProfile(
  request: Request,
  response: Response,
): Promise<void> {
  const activeUser = await requireActiveUser(request, response);
  if (!activeUser) return;

  if (activeUser.employee_id === null) {
    response.status(400).json({
      success: false,
      message: "This account is not connected to an employee profile",
    });
    return;
  }

  const attemptedRestrictedFields = Object.keys(request.body).filter((field) =>
    restrictedFields.has(field),
  );

  if (attemptedRestrictedFields.length > 0) {
    response.status(400).json({
      success: false,
      message: `Restricted profile fields cannot be updated: ${attemptedRestrictedFields.join(", ")}`,
    });
    return;
  }

  const updates = Object.entries(editableFieldColumns).filter(([field]) =>
    Object.hasOwn(request.body, field),
  );

  if (updates.length === 0) {
    response.status(400).json({
      success: false,
      message: "No editable profile fields were provided",
    });
    return;
  }

  const values: Array<string | null | number> = [];
  const assignments = updates.map(([field, column], index) => {
    const value = request.body[field];

    if (value !== null && typeof value !== "string") {
      return null;
    }

    values.push(typeof value === "string" ? value.trim() || null : null);
    return `${column} = $${index + 1}`;
  });

  if (assignments.some((assignment) => assignment === null)) {
    response.status(400).json({
      success: false,
      message: "Editable profile fields must contain text or null values",
    });
    return;
  }

  values.push(activeUser.employee_id);
  await pool.query(
    `UPDATE employees
     SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${values.length}`,
    values,
  );

  const user = await findSafeUserById(activeUser.id);
  response.status(200).json({
    success: true,
    message: "Profile updated successfully",
    data: { user },
  });
}

export async function changePassword(
  request: Request,
  response: Response,
): Promise<void> {
  const currentPassword =
    typeof request.body.currentPassword === "string" ? request.body.currentPassword : "";
  const newPassword =
    typeof request.body.newPassword === "string" ? request.body.newPassword : "";
  const confirmPassword =
    typeof request.body.confirmPassword === "string" ? request.body.confirmPassword : "";

  if (!currentPassword || !newPassword || !confirmPassword) {
    response.status(400).json({
      success: false,
      message: "Current password, new password, and confirmation are required",
    });
    return;
  }

  if (newPassword !== confirmPassword) {
    response.status(400).json({
      success: false,
      message: "New password and confirmation do not match",
    });
    return;
  }

  if (newPassword.length < 8) {
    response.status(400).json({
      success: false,
      message: "New password must be at least 8 characters long",
    });
    return;
  }

  const user = await requireActiveUser(request, response);
  if (!user) return;

  if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
    response.status(400).json({
      success: false,
      message: "Current password is incorrect",
    });
    return;
  }

  if (await bcrypt.compare(newPassword, user.password_hash)) {
    response.status(400).json({
      success: false,
      message: "New password must be different from the current password",
    });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.query(
    `UPDATE users
     SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [passwordHash, user.id],
  );

  // The event, never the secret: no password, no hash, and no change set at all.
  await recordAudit({
    actor: actorFromUser(request.user, request.user?.email),
    action: "PASSWORD_CHANGED",
    entityType: "auth",
    entityId: user.id,
    summary: "Changed their own password",
  });

  response.status(200).json({
    success: true,
    message: "Password changed successfully",
  });
}

export async function uploadProfileImage(
  request: Request,
  response: Response,
): Promise<void> {
  const activeUser = await requireActiveUser(request, response);
  if (!activeUser) {
    if (request.file) {
      await removeManagedProfileImage(
        `${profileImageUrlPrefix}${request.file.filename}`,
      );
    }
    return;
  }

  if (activeUser.employee_id === null) {
    if (request.file) {
      await removeManagedProfileImage(
        `${profileImageUrlPrefix}${request.file.filename}`,
      );
    }
    response.status(400).json({
      success: false,
      message: "This account is not connected to an employee profile",
    });
    return;
  }

  if (!request.file) {
    response.status(400).json({
      success: false,
      message: 'Select an image using the field name "image"',
    });
    return;
  }

  const newImagePath = `${profileImageUrlPrefix}${request.file.filename}`;
  const client = await pool.connect().catch(async (error: unknown) => {
    await removeManagedProfileImage(newImagePath);
    throw error;
  });
  let previousImagePath: string | null = null;

  try {
    await client.query("BEGIN");
    const currentImage = await client.query<{ profile_image: string | null }>(
      `SELECT profile_image
       FROM employees
       WHERE id = $1
       FOR UPDATE`,
      [activeUser.employee_id],
    );

    if (!currentImage.rows[0]) {
      throw new Error("Employee profile was not found");
    }

    previousImagePath = currentImage.rows[0].profile_image;
    await client.query(
      `UPDATE employees
       SET profile_image = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newImagePath, activeUser.employee_id],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    await removeManagedProfileImage(newImagePath);
    throw error;
  } finally {
    client.release();
  }

  if (previousImagePath !== newImagePath) {
    await removeManagedProfileImage(previousImagePath);
  }

  const user = await findSafeUserById(activeUser.id);
  response.status(200).json({
    success: true,
    message: "Profile photo updated successfully",
    data: { user },
  });
}

export async function deleteProfileImage(
  request: Request,
  response: Response,
): Promise<void> {
  const activeUser = await requireActiveUser(request, response);
  if (!activeUser) return;

  if (activeUser.employee_id === null) {
    response.status(400).json({
      success: false,
      message: "This account is not connected to an employee profile",
    });
    return;
  }

  const client = await pool.connect();
  let previousImagePath: string | null = null;

  try {
    await client.query("BEGIN");
    const currentImage = await client.query<{ profile_image: string | null }>(
      `SELECT profile_image
       FROM employees
       WHERE id = $1
       FOR UPDATE`,
      [activeUser.employee_id],
    );

    if (!currentImage.rows[0]) {
      await client.query("ROLLBACK");
      response.status(404).json({
        success: false,
        message: "Employee profile was not found",
      });
      return;
    }

    previousImagePath = currentImage.rows[0].profile_image;
    await client.query(
      `UPDATE employees
       SET profile_image = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [activeUser.employee_id],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await removeManagedProfileImage(previousImagePath);

  const user = await findSafeUserById(activeUser.id);
  response.status(200).json({
    success: true,
    message: "Profile photo removed successfully",
    data: { user },
  });
}
