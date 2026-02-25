-- Migration: Drop project_id column from time_sessions table
-- Since projects are now managed via Frappe, we no longer need the project_id foreign key
-- Run this in your Supabase SQL editor

BEGIN;

-- Step 1: Drop the foreign key constraint if it exists
-- Try common constraint names directly (PostgreSQL auto-generates these)
ALTER TABLE time_sessions DROP CONSTRAINT IF EXISTS time_sessions_project_id_fkey;
ALTER TABLE time_sessions DROP CONSTRAINT IF EXISTS fk_time_sessions_project;

-- Also try to find and drop any other foreign key constraints on project_id
DO $$
DECLARE
    constraint_name_var TEXT;
BEGIN
    -- Try to find the constraint name
    SELECT constraint_name INTO constraint_name_var
    FROM information_schema.table_constraints
    WHERE table_name = 'time_sessions'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%project_id%'
    LIMIT 1;
    
    -- Drop the constraint if found
    IF constraint_name_var IS NOT NULL THEN
        EXECUTE 'ALTER TABLE time_sessions DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_name_var);
    END IF;
END $$;

-- Step 2: Drop the index if it exists
DROP INDEX IF EXISTS idx_time_sessions_project_id;

-- Step 3: Drop the column
ALTER TABLE time_sessions 
DROP COLUMN IF EXISTS project_id;

-- Step 4: Add comment to document the change
COMMENT ON TABLE time_sessions IS 'Time tracking sessions. Projects are now tracked via Frappe (frappe_project_id, frappe_task_id, frappe_timesheet_id columns).';

COMMIT;

