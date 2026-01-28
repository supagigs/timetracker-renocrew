-- Migration: Cleanup incorrect project assignments
-- This script removes projects that were incorrectly stored with wrong user_email
-- After running this, projects will be re-synced correctly when users log in and fetch their projects
-- Run this in your Supabase SQL editor

BEGIN;

-- Option 1: Delete all projects and let them re-sync (RECOMMENDED)
-- This is the safest approach - projects will be re-synced correctly when:
-- 1. Employees log in and fetch their assigned projects
-- 2. The system correctly stores them with the right user_email
DELETE FROM projects;

-- Option 2 (COMMENTED OUT): If you want to keep projects but fix them manually
-- You would need to query Frappe API to find which user each project belongs to
-- and update them accordingly. This is more complex and error-prone.
-- 
-- Example query to update specific projects:
-- UPDATE projects 
-- SET user_email = 'correct.user@example.com'
-- WHERE frappe_project_id = 'PROJ-0001';

-- Note: After deletion, projects will be automatically re-synced when:
-- - Employees log in: fetchEmployeeProjects() will fetch and store their assigned projects
-- - The projects table will only contain projects that are actually assigned to users

COMMIT;

-- Verification query (optional - run separately if needed):
-- SELECT user_email, COUNT(*) as project_count, 
--        array_agg(DISTINCT frappe_project_id) as project_ids
-- FROM projects 
-- GROUP BY user_email 
-- ORDER BY project_count DESC;

