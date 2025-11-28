-- Migration: Update default screenshot interval from 20 seconds to 5 minutes (300 seconds)
-- Run this in your Supabase SQL editor
-- This updates the existing table's default value and existing records
--
-- DEPRECATED: This migration is historical. The screenshot_interval_seconds column
-- has been removed. Use freelancer_intervals JSON map instead.

-- Step 1: Update the default value for the column
ALTER TABLE client_settings 
  ALTER COLUMN screenshot_interval_seconds SET DEFAULT 300;

-- Step 2: Update any existing records that have the old default value (20 seconds)
-- This ensures all existing clients get the new default
UPDATE client_settings 
SET screenshot_interval_seconds = 300,
    updated_at = NOW()
WHERE screenshot_interval_seconds = 20;

-- Step 3: Verify the change
-- You can run this query to check:
-- SELECT column_name, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'client_settings' AND column_name = 'screenshot_interval_seconds';

COMMENT ON COLUMN client_settings.screenshot_interval_seconds IS 'Screenshot capture interval in seconds. Default is 300 (5 minutes).';

