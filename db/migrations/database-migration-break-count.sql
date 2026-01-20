-- Add break_count column to time_sessions table
-- Run this in your Supabase SQL editor

ALTER TABLE time_sessions 
ADD COLUMN IF NOT EXISTS break_count INTEGER DEFAULT 0;

-- Add comment to explain the column
COMMENT ON COLUMN time_sessions.break_count IS 'Number of breaks taken during the session';

-- Update any existing sessions with estimated break count (assuming 5 minute breaks)
UPDATE time_sessions 
SET break_count = CEIL(break_duration / 300.0)
WHERE break_count = 0 AND break_duration > 0;



