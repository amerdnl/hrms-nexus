import pool from "../config/db.js";
import type { AuthenticatedUser, UserRole } from "../types/auth.js";

// Check live account state without selecting credentials or personal profile data.
export async function findSessionUserById(
  userId: number,
): Promise<AuthenticatedUser | null> {
  const result = await pool.query<{
    id: string;
    employee_id: string | null;
    role: UserRole;
    email: string;
  }>(
    `SELECT u.id, u.employee_id, u.role, u.email
     FROM users u
     LEFT JOIN employees e ON e.id = u.employee_id
     WHERE u.id = $1 AND u.is_active = TRUE
       AND (
         (u.role = 'admin' AND u.employee_id IS NULL)
         OR e.employment_status IN ('active', 'probation')
       )`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const id = Number(row.id);
  const employeeId = row.employee_id === null ? null : Number(row.employee_id);
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !["admin", "employee"].includes(row.role) ||
    (employeeId !== null && (!Number.isSafeInteger(employeeId) || employeeId <= 0)) ||
    (row.role === "employee" && employeeId === null)
  ) {
    return null;
  }

  return { id, employeeId, role: row.role, email: row.email };
}

export interface UserRecord {
  id: number;
  employee_id: number | null;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
}

export interface SafeUser {
  id: number;
  employeeId: number | null;
  email: string;
  role: UserRole;
  isActive: boolean;
  employee: {
    employeeNumber: string;
    fullName: string;
    phone: string | null;
    address: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    jobTitle: string | null;
    department: { id: number; name: string } | null;
    employmentDate: string | null;
    employmentStatus: string;
    profileImage: string | null;
  } | null;
}

interface SafeUserRow {
  id: number;
  employee_id: number | null;
  email: string;
  role: UserRole;
  is_active: boolean;
  employee_number: string | null;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  date_of_birth: string | null;
  gender: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  job_title: string | null;
  department_id: number | null;
  department_name: string | null;
  employment_date: string | null;
  employment_status: string | null;
  profile_image: string | null;
}

const safeUserSelect = `
  SELECT
    u.id,
    u.employee_id,
    u.email,
    u.role,
    u.is_active,
    e.employee_number,
    e.full_name,
    e.phone,
    e.address,
    e.date_of_birth,
    e.gender,
    e.emergency_contact_name,
    e.emergency_contact_phone,
    e.job_title,
    e.department_id,
    d.name AS department_name,
    e.employment_date,
    e.employment_status,
    e.profile_image
  FROM users u
  LEFT JOIN employees e ON e.id = u.employee_id
  LEFT JOIN departments d ON d.id = e.department_id
`;

function toSafeUser(row: SafeUserRow): SafeUser {
  return {
    id: row.id,
    employeeId: row.employee_id,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    employee:
      row.employee_id === null || row.employee_number === null || row.full_name === null
        ? null
        : {
            employeeNumber: row.employee_number,
            fullName: row.full_name,
            phone: row.phone,
            address: row.address,
            dateOfBirth: row.date_of_birth,
            gender: row.gender,
            emergencyContactName: row.emergency_contact_name,
            emergencyContactPhone: row.emergency_contact_phone,
            jobTitle: row.job_title,
            department:
              row.department_id === null || row.department_name === null
                ? null
                : { id: row.department_id, name: row.department_name },
            employmentDate: row.employment_date,
            employmentStatus: row.employment_status ?? "",
            profileImage: row.profile_image,
          },
  };
}

export async function findUserRecordByEmail(
  email: string,
): Promise<UserRecord | null> {
  // Matches the users_email_normalized_key expression exactly, so sign-in resolves
  // an account by the same identity the database enforces as unique.
  const result = await pool.query<UserRecord>(
    `SELECT id, employee_id, email, password_hash, role, is_active
     FROM users
     WHERE lower(btrim(email)) = lower(btrim($1))
     LIMIT 1`,
    [email],
  );

  return result.rows[0] ?? null;
}

export async function findUserRecordById(
  userId: number,
): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    `SELECT id, employee_id, email, password_hash, role, is_active
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function findSafeUserById(userId: number): Promise<SafeUser | null> {
  const result = await pool.query<SafeUserRow>(
    `${safeUserSelect} WHERE u.id = $1 LIMIT 1`,
    [userId],
  );

  const row = result.rows[0];
  return row ? toSafeUser(row) : null;
}
