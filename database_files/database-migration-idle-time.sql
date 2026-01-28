-- Add idle_duration column to time_sessions table
-- Run this in your Supabase SQL editor

ALTER TABLE time_sessions 
ADD COLUMN idle_duration INTEGER DEFAULT 0; -- in seconds

-- Add comment to explain the column
COMMENT ON COLUMN time_sessions.idle_duration IS 'Total idle time during the session (in seconds)';





