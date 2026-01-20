-- Migration: Calculate and update total_duration for all existing time_sessions records
-- total_duration = active_duration + break_duration + idle_duration
-- Run this in your Supabase SQL editor

BEGIN;

-- Update all existing records where total_duration is NULL or needs to be recalculated
-- This uses COALESCE to handle NULL values (treats them as 0)
UPDATE time_sessions
SET total_duration = COALESCE(active_duration, 0) + 
                     COALESCE(break_duration, 0) + 
                     COALESCE(idle_duration, 0)
WHERE total_duration IS NULL 
   OR total_duration != (COALESCE(active_duration, 0) + 
                         COALESCE(break_duration, 0) + 
                         COALESCE(idle_duration, 0));

-- Optional: If you want to update ALL records regardless of current value, use this instead:
-- UPDATE time_sessions
-- SET total_duration = COALESCE(active_duration, 0) + 
--                      COALESCE(break_duration, 0) + 
--                      COALESCE(idle_duration, 0);

COMMIT;

