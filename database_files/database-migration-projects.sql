-- Migration: Add projects table for Client users
-- Run this in your Supabase SQL editor

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  project_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, project_name)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (permissive for anon key usage)
DROP POLICY IF EXISTS "Allow all SELECT on projects" ON projects;
DROP POLICY IF EXISTS "Allow all INSERT on projects" ON projects;
DROP POLICY IF EXISTS "Allow all UPDATE on projects" ON projects;
DROP POLICY IF EXISTS "Allow all DELETE on projects" ON projects;

CREATE POLICY "Allow all SELECT on projects" ON projects 
  FOR SELECT USING (true);

CREATE POLICY "Allow all INSERT on projects" ON projects 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all UPDATE on projects" ON projects 
  FOR UPDATE USING (true);

CREATE POLICY "Allow all DELETE on projects" ON projects 
  FOR DELETE USING (true);

-- Add comment
COMMENT ON TABLE projects IS 'Projects associated with Client users. Each user can have multiple projects. References users(id).';

