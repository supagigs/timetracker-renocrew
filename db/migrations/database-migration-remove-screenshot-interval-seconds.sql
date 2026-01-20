-- Migration: Remove screenshot_interval_seconds column from client_settings table
-- Run this in your Supabase SQL editor
-- This removes the deprecated screenshot_interval_seconds column as the system
-- now uses freelancer_intervals JSON map for per-freelancer configuration

-- Step 1: Drop the column
ALTER TABLE client_settings 
  DROP COLUMN IF EXISTS screenshot_interval_seconds;

-- Step 2: Verify the column has been removed
-- You can run this query to verify:
-- SELECT column_name 
-- FROM information_schema.columns 
-- WHERE table_name = 'client_settings' AND column_name = 'screenshot_interval_seconds';
-- This should return no rows after the migration

