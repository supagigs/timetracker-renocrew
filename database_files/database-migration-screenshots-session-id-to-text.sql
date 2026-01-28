-- Migration: Change screenshots.session_id from INTEGER to TEXT
-- This allows storing Frappe timesheet IDs (strings like "TS-2025-00043")
-- Run this in your Supabase SQL editor

BEGIN;

-- Step 1: Drop the foreign key constraint if it exists
DO $$
BEGIN
    -- Drop foreign key constraint if it exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name LIKE '%screenshots_session_id%' 
        AND table_name = 'screenshots'
    ) THEN
        ALTER TABLE screenshots 
        DROP CONSTRAINT IF EXISTS screenshots_session_id_fkey;
    END IF;
END $$;

-- Step 2: Change the column type from INTEGER to TEXT
-- The USING clause automatically converts existing integer values to text strings
ALTER TABLE screenshots 
ALTER COLUMN session_id TYPE TEXT USING session_id::TEXT;

-- Step 4: Add comment to explain the change
COMMENT ON COLUMN screenshots.session_id IS 'Session identifier - can be Supabase time_sessions.id (integer as text) or Frappe timesheet ID (e.g., "TS-2025-00043")';

-- Step 5: Recreate indexes that reference session_id (they should work with TEXT)
-- Drop existing indexes if they exist
DROP INDEX IF EXISTS idx_screenshots_session_user_email;
DROP INDEX IF EXISTS idx_screenshots_session_user_captured;

-- Recreate indexes with TEXT session_id
CREATE INDEX IF NOT EXISTS idx_screenshots_session_id 
ON screenshots(session_id);

CREATE INDEX IF NOT EXISTS idx_screenshots_session_user_email 
ON screenshots(session_id, user_email);

CREATE INDEX IF NOT EXISTS idx_screenshots_session_user_captured 
ON screenshots(session_id, user_email, captured_at);

COMMIT;

