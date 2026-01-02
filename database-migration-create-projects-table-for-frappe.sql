-- Migration: Create projects table to store Frappe projects assigned to users
-- This table will be updated whenever a user logs in to sync their assigned projects from Frappe
-- Run this in your Supabase SQL editor

BEGIN;

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  frappe_project_id TEXT NOT NULL, -- Frappe project ID (e.g., "PROJ-001" or project name)
  project_name TEXT NOT NULL, -- Project name from Frappe
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_frappe_project_id ON projects(frappe_project_id);

-- Create unique constraint: a user should not have duplicate Frappe project IDs
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_user_id_frappe_project_id 
ON projects(user_id, frappe_project_id);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (permissive for Electron app, adjust for production)
DROP POLICY IF EXISTS "Allow all SELECT on projects" ON projects;
DROP POLICY IF EXISTS "Allow all INSERT on projects" ON projects;
DROP POLICY IF EXISTS "Allow all UPDATE on projects" ON projects;
DROP POLICY IF EXISTS "Allow all DELETE on projects" ON projects;

CREATE POLICY "Allow all SELECT on projects" ON projects FOR SELECT USING (true);
CREATE POLICY "Allow all INSERT on projects" ON projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all UPDATE on projects" ON projects FOR UPDATE USING (true);
CREATE POLICY "Allow all DELETE on projects" ON projects FOR DELETE USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_projects_updated_at ON projects;
CREATE TRIGGER trigger_update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_projects_updated_at();

COMMIT;

-- Comments for documentation
COMMENT ON TABLE projects IS 'Stores projects assigned to users from Frappe. Updated on login.';
COMMENT ON COLUMN projects.user_id IS 'Foreign key to users table';
COMMENT ON COLUMN projects.frappe_project_id IS 'Frappe project ID (unique identifier from Frappe, e.g., "PROJ-001")';
COMMENT ON COLUMN projects.project_name IS 'Project name from Frappe';
COMMENT ON COLUMN projects.updated_at IS 'Timestamp when project was last synced from Frappe';

