-- Development login: admin@hrnexus.test / Admin123!
-- Development login: employee@hrnexus.test / Employee123!
-- Passwords below are bcrypt hashes; never store plain-text passwords.

INSERT INTO departments (name, description)
VALUES ('Engineering', 'Sample department for local development')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO employees (
  employee_number,
  full_name,
  phone,
  address,
  date_of_birth,
  gender,
  emergency_contact_name,
  emergency_contact_phone,
  job_title,
  department_id,
  employment_date,
  employment_status
)
VALUES (
  'EMP-001',
  'Sample Employee',
  '+60 12-345 6789',
  'Kuala Lumpur',
  DATE '1995-06-15',
  'Not specified',
  'Sample Emergency Contact',
  '+60 12-987 6543',
  'Software Engineer',
  (SELECT id FROM departments WHERE name = 'Engineering'),
  DATE '2025-01-02',
  'active'
)
ON CONFLICT (employee_number) DO UPDATE
SET full_name = EXCLUDED.full_name,
    department_id = EXCLUDED.department_id,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO users (employee_id, email, password_hash, role, is_active)
VALUES (
  NULL,
  'admin@hrnexus.test',
  '$2b$12$nSG1WFgU6VlkueinQHV4z.oUEjsts8A6pLV.aNmnpV91ibVZeOrZ.',
  'admin',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (employee_id, email, password_hash, role, is_active)
VALUES (
  (SELECT id FROM employees WHERE employee_number = 'EMP-001'),
  'employee@hrnexus.test',
  '$2b$12$Twg17KxhyFcCpKG2Lnjg/eLX6v3Lz3Bfaca9TvrekdbhC5P.ON1ja',
  'employee',
  TRUE
)
ON CONFLICT (email) DO NOTHING;
