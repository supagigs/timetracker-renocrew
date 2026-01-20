-- Migration: Add project assignments for Freelancers
-- This allows Clients to assign their projects to Freelancers
-- Run this in your Supabase SQL editor

-- Create project_assignments table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS project_assignments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  freelancer_email TEXT NOT NULL,
  assigned_by TEXT NOT NULL, -- Client email who assigned the project
  assigned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, freelancer_email)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_project_assignments_project_id ON project_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_freelancer_email ON project_assignments(freelancer_email);

-- Enable RLS
ALTER TABLE project_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (permissive for anon key usage)
DROP POLICY IF EXISTS "Allow all SELECT on project_assignments" ON project_assignments;
DROP POLICY IF EXISTS "Allow all INSERT on project_assignments" ON project_assignments;
DROP POLICY IF EXISTS "Allow all UPDATE on project_assignments" ON project_assignments;
DROP POLICY IF EXISTS "Allow all DELETE on project_assignments" ON project_assignments;

CREATE POLICY "Allow all SELECT on project_assignments" ON project_assignments 
  FOR SELECT USING (true);

CREATE POLICY "Allow all INSERT on project_assignments" ON project_assignments 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all UPDATE on project_assignments" ON project_assignments 
  FOR UPDATE USING (true);

CREATE POLICY "Allow all DELETE on project_assignments" ON project_assignments 
  FOR DELETE USING (true);

-- Add project_id column to time_sessions to track which project was worked on
ALTER TABLE time_sessions 
ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);

-- Create index for project_id in time_sessions
CREATE INDEX IF NOT EXISTS idx_time_sessions_project_id ON time_sessions(project_id);

-- Add comment
COMMENT ON TABLE project_assignments IS 'Assigns projects to freelancers. Links projects to freelancer emails for work tracking.';


