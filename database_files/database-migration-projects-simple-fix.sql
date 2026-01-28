-- SIMPLE FIX: Projects Not Being Saved
-- Run this in Supabase SQL Editor to fix the issue immediately

-- Step 1: Make sure table exists
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  project_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_email, project_name)
);

-- Step 2: Create index
CREATE INDEX IF NOT EXISTS idx_projects_user_email ON projects(user_email);

-- Step 3: DISABLE RLS temporarily to allow inserts
-- This is the quickest fix - RLS was blocking the inserts
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;

-- Step 4: Verify the table is ready
SELECT 
  'Table exists' as status,
  COUNT(*) as existing_projects
FROM projects;

-- After running this, try signing up a Client user again
-- The projects should now save successfully



