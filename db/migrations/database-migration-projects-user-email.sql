-- Migration: Change projects.user_id to projects.user_email
-- This migration changes the projects table to use user_email instead of user_id
-- Users are fetched from Frappe via email, so storing email directly is more reliable
-- Run this in your Supabase SQL editor

BEGIN;

-- Step 1: Drop foreign key constraint on user_id if it exists
DO $$
DECLARE
    constraint_name TEXT;
    user_id_attnum SMALLINT;
BEGIN
    -- Get the attribute number for user_id column
    SELECT attnum INTO user_id_attnum
    FROM pg_attribute 
    WHERE attrelid = 'projects'::regclass 
    AND attname = 'user_id'
    LIMIT 1;
    
    -- Only proceed if user_id column exists
    IF user_id_attnum IS NOT NULL THEN
        SELECT conname INTO constraint_name
        FROM pg_constraint
        WHERE conrelid = 'projects'::regclass
        AND contype = 'f'
        AND confrelid = 'users'::regclass
        AND conkey @> ARRAY[user_id_attnum]
        LIMIT 1;
        
        IF constraint_name IS NOT NULL THEN
            EXECUTE 'ALTER TABLE projects DROP CONSTRAINT IF EXISTS ' || constraint_name;
            RAISE NOTICE 'Dropped foreign key constraint: %', constraint_name;
        END IF;
    END IF;
END $$;

-- Step 2: Drop indexes that depend on user_id
DROP INDEX IF EXISTS idx_projects_user_id;
DROP INDEX IF EXISTS idx_projects_user_id_frappe_project_id;
DROP INDEX IF EXISTS projects_user_id_project_name_key;
DROP INDEX IF EXISTS projects_user_id_frappe_project_id_key;

-- Step 3: Drop unique constraints that depend on user_id
DO $$
DECLARE
    constraint_name TEXT;
    user_id_attnum SMALLINT;
BEGIN
    -- Get the attribute number for user_id column
    SELECT attnum INTO user_id_attnum
    FROM pg_attribute 
    WHERE attrelid = 'projects'::regclass 
    AND attname = 'user_id'
    LIMIT 1;
    
    -- Only proceed if user_id column exists
    IF user_id_attnum IS NOT NULL THEN
        -- Find and drop unique constraints on (user_id, ...)
        FOR constraint_name IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'projects'::regclass
            AND contype = 'u'
            AND conkey @> ARRAY[user_id_attnum]
        LOOP
            EXECUTE 'ALTER TABLE projects DROP CONSTRAINT IF EXISTS ' || constraint_name;
            RAISE NOTICE 'Dropped unique constraint: %', constraint_name;
        END LOOP;
    END IF;
END $$;

-- Step 4: Check if user_email column already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_attribute 
        WHERE attrelid = 'projects'::regclass 
        AND attname = 'user_email'
    ) THEN
        -- Add user_email column if it doesn't exist
        ALTER TABLE projects ADD COLUMN user_email TEXT;
        RAISE NOTICE 'Added user_email column';
    ELSE
        RAISE NOTICE 'user_email column already exists';
    END IF;
END $$;

-- Step 5: Migrate data from user_id to user_email if user_id exists
-- This will populate user_email with the email from the users table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_attribute 
        WHERE attrelid = 'projects'::regclass 
        AND attname = 'user_id'
    ) THEN
        -- Update user_email from users table where user_id matches
        UPDATE projects p
        SET user_email = LOWER(TRIM(u.email))
        FROM users u
        WHERE p.user_id = u.id
        AND (p.user_email IS NULL OR p.user_email = '');
        
        RAISE NOTICE 'Migrated user emails from users table';
    END IF;
END $$;

-- Step 6: Drop user_id column
ALTER TABLE projects DROP COLUMN IF EXISTS user_id;

-- Step 7: Set user_email as NOT NULL (after data migration)
ALTER TABLE projects ALTER COLUMN user_email SET NOT NULL;

-- Step 8: Create indexes on user_email
CREATE INDEX IF NOT EXISTS idx_projects_user_email ON projects(user_email);
CREATE INDEX IF NOT EXISTS idx_projects_frappe_project_id ON projects(frappe_project_id);

-- Step 9: Create unique constraint on (user_email, frappe_project_id)
-- This ensures a user cannot have duplicate Frappe project IDs
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_user_email_frappe_project_id 
ON projects(user_email, frappe_project_id);

-- Step 10: Add comments
COMMENT ON COLUMN projects.user_email IS 'User email (users are fetched from Frappe via email)';
COMMENT ON COLUMN projects.frappe_project_id IS 'Frappe project ID (unique identifier from Frappe, e.g., "PROJ-001")';
COMMENT ON COLUMN projects.project_name IS 'Project name from Frappe';

COMMIT;

-- Verification queries (optional - run separately if needed):
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'projects' AND column_name IN ('user_id', 'user_email');
-- 
-- SELECT indexname FROM pg_indexes WHERE tablename = 'projects';

