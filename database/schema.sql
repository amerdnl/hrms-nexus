CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  employee_number VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30),
  address TEXT,
  date_of_birth DATE,
  gender VARCHAR(20),
  emergency_contact_name VARCHAR(150),
  emergency_contact_phone VARCHAR(30),
  job_title VARCHAR(100),
  department_id INTEGER REFERENCES departments(id),
  employment_date DATE,
  employment_status VARCHAR(20) NOT NULL DEFAULT 'active',
  profile_image TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employees_department_id
  ON employees(department_id);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'employee')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGSERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL
    REFERENCES employees(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  check_in_time TIME,
  check_out_time TIME,
  status VARCHAR(20) NOT NULL DEFAULT 'present',
  is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_employee_attendance_date
    UNIQUE (employee_id, attendance_date),

  CONSTRAINT chk_attendance_status
    CHECK (status IN ('present', 'late', 'absent', 'on_leave')),

  CONSTRAINT chk_attendance_times
    CHECK (
      check_out_time IS NULL
      OR check_in_time IS NULL
      OR check_out_time >= check_in_time
    )
);

CREATE INDEX IF NOT EXISTS idx_attendance_employee_id
  ON attendance(employee_id);

CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON attendance(attendance_date);

CREATE INDEX IF NOT EXISTS idx_attendance_status
  ON attendance(status)