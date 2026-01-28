-- Migration: Fix total_duration calculation and ensure NULL values are handled correctly
-- This migration:
-- 1. Recalculates total_duration as the sum of active_duration + break_duration + idle_duration
-- 2. Ensures NULL values are treated as 0
-- Run this in your Supabase SQL editor

BEGIN;

-- Update all records to recalculate total_duration correctly
-- This uses COALESCE to handle NULL values (treats them as 0)
UPDATE time_sessions
SET total_duration = COALESCE(active_duration, 0) + 
                     COALESCE(break_duration, 0) + 
                     COALESCE(idle_duration, 0)
WHERE total_duration IS NULL 
   OR total_duration != (COALESCE(active_duration, 0) + 
                         COALESCE(break_duration, 0) + 
                         COALESCE(idle_duration, 0));

-- Also ensure that NULL values in component fields are set to 0 for consistency
-- This helps prevent display issues in the web reports
UPDATE time_sessions
SET active_duration = COALESCE(active_duration, 0),
    break_duration = COALESCE(break_duration, 0),
    idle_duration = COALESCE(idle_duration, 0)
WHERE active_duration IS NULL 
   OR break_duration IS NULL 
   OR idle_duration IS NULL;

COMMIT;

-- Verification query (run this after the migration to check results)
-- SELECT 
--   id,
--   active_duration,
--   break_duration,
--   idle_duration,
--   total_duration,
--   (COALESCE(active_duration, 0) + COALESCE(break_duration, 0) + COALESCE(idle_duration, 0)) as calculated_total,
--   CASE 
--     WHEN total_duration = (COALESCE(active_duration, 0) + COALESCE(break_duration, 0) + COALESCE(idle_duration, 0))
--     THEN 'OK'
--     ELSE 'MISMATCH'
--   END as status
-- FROM time_sessions
-- WHERE end_time IS NOT NULL
-- ORDER BY start_time DESC
-- LIMIT 10;



