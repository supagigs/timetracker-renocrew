-- Migration: Create employees table (leave_approver fields belong here, not in users)
-- Timesheets and Leaves are fetched from Frappe via employees (employee ID).
-- Run this in your Supabase SQL editor
--
-- If users already has leave_approver_email/leave_approver_name, they will be dropped.

BEGIN;

-- 1. Create employees table (links to users; one employee per user typically)
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  frappe_employee_id TEXT NOT NULL,  -- Employee name/ID from Frappe (used for timesheets/leaves API)
  leave_approver_email TEXT,        -- From Frappe Employee.leave_approver (User email)
  leave_approver_name TEXT,         -- From Frappe Employee.leave_approver (User full name)
  company TEXT,                     -- Cached from Frappe Employee
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id),
  UNIQUE(frappe_employee_id)
);

-- 2. Drop leave_approver columns from users (shifted to employees)
ALTER TABLE users DROP COLUMN IF EXISTS leave_approver_email;
ALTER TABLE users DROP COLUMN IF EXISTS leave_approver_name;

-- 4. Create indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_frappe_employee_id ON employees(frappe_employee_id);

-- 5. Enable RLS and add permissive policies (same pattern as users)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all SELECT on employees" ON employees;
DROP POLICY IF EXISTS "Allow all INSERT on employees" ON employees;
DROP POLICY IF EXISTS "Allow all UPDATE on employees" ON employees;

CREATE POLICY "Allow all SELECT on employees" ON employees FOR SELECT USING (true);
CREATE POLICY "Allow all INSERT on employees" ON employees FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all UPDATE on employees" ON employees FOR UPDATE USING (true);

-- 6. Add comments
COMMENT ON TABLE employees IS 'Cached Employee records from Frappe. Links to users. Timesheets and Leaves are fetched from Frappe via frappe_employee_id.';
COMMENT ON COLUMN employees.frappe_employee_id IS 'Employee name/ID from Frappe Employee doctype - used for timesheets and leave APIs';
COMMENT ON COLUMN employees.leave_approver_email IS 'Email of leave approver (from Frappe Employee.leave_approver)';
COMMENT ON COLUMN employees.leave_approver_name IS 'Name of leave approver (from Frappe Employee.leave_approver)';

COMMIT;
