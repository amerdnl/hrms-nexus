CREATE TABLE IF NOT EXISTS attendance (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL,
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
        CHECK (
            status IN ('present', 'late', 'absent', 'on_leave')
        ),

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
    ON attendance(status);