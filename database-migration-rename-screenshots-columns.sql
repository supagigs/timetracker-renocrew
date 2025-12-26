-- Migration: Rename columns in screenshots table to match Frappe naming
-- Rename session_id to frappe_timesheet_id
-- Rename project_id to frappe_project_id  
-- Add frappe_task_id column
-- Run this in your Supabase SQL editor

BEGIN;

-- Step 1: Rename session_id to frappe_timesheet_id
ALTER TABLE screenshots 
RENAME COLUMN session_id TO frappe_timesheet_id;

-- Step 2: Rename project_id to frappe_project_id (if it exists)
ALTER TABLE screenshots 
RENAME COLUMN project_id TO frappe_project_id;

-- Step 3: Add frappe_task_id column if it doesn't exist
ALTER TABLE screenshots 
ADD COLUMN IF NOT EXISTS frappe_task_id TEXT;

-- Step 3.5: Add captured_idle column if it doesn't exist
-- This tracks whether the screenshot was captured during idle time (no keyboard/mouse activity)
ALTER TABLE screenshots 
ADD COLUMN IF NOT EXISTS captured_idle BOOLEAN DEFAULT FALSE;

-- Step 4: Update comments to explain the columns
COMMENT ON COLUMN screenshots.frappe_timesheet_id IS 'Frappe timesheet ID (e.g., "TS-2025-00043") associated with this screenshot';
COMMENT ON COLUMN screenshots.frappe_project_id IS 'Frappe project ID (name) associated with this screenshot';
COMMENT ON COLUMN screenshots.frappe_task_id IS 'Frappe task ID (name) associated with this screenshot';
COMMENT ON COLUMN screenshots.captured_idle IS 'TRUE if screenshot was captured during idle time (no keyboard/mouse activity for 30+ seconds), FALSE otherwise';

-- Step 5: Update indexes if they exist
-- Drop old index if it exists
DROP INDEX IF EXISTS idx_screenshots_session_id;
DROP INDEX IF EXISTS idx_screenshots_session_user_email;
DROP INDEX IF EXISTS idx_screenshots_session_user_captured;

-- Create new indexes with renamed column
CREATE INDEX IF NOT EXISTS idx_screenshots_frappe_timesheet_id 
ON screenshots(frappe_timesheet_id);

CREATE INDEX IF NOT EXISTS idx_screenshots_frappe_timesheet_user_email 
ON screenshots(frappe_timesheet_id, user_email);

CREATE INDEX IF NOT EXISTS idx_screenshots_frappe_timesheet_user_captured 
ON screenshots(frappe_timesheet_id, user_email, captured_at);

-- Create index for frappe_project_id if it exists
CREATE INDEX IF NOT EXISTS idx_screenshots_frappe_project_id 
ON screenshots(frappe_project_id);

-- Create index for frappe_task_id
CREATE INDEX IF NOT EXISTS idx_screenshots_frappe_task_id 
ON screenshots(frappe_task_id);

COMMIT;

