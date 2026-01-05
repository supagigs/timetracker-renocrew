-- Migration: Normalize company values and create case-insensitive comparison helper
-- This helps fix issues where company comparisons fail due to case sensitivity or whitespace
-- Run this in your Supabase SQL editor

BEGIN;

-- Step 1: Normalize existing company values (trim whitespace, but keep original case)
-- This ensures consistency in the database
UPDATE users 
SET company = TRIM(company) 
WHERE company IS NOT NULL AND company != TRIM(company);

UPDATE time_sessions 
SET company = TRIM(company) 
WHERE company IS NOT NULL AND company != TRIM(company);

UPDATE screenshots 
SET company = TRIM(company) 
WHERE company IS NOT NULL AND company != TRIM(company);

-- Step 2: Create a function for case-insensitive company comparison
-- This helps when comparing company values in queries
CREATE OR REPLACE FUNCTION compare_company(company1 TEXT, company2 TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Handle NULL cases
  IF company1 IS NULL AND company2 IS NULL THEN
    RETURN TRUE;
  END IF;
  IF company1 IS NULL OR company2 IS NULL THEN
    RETURN FALSE;
  END IF;
  -- Case-insensitive comparison after trimming
  RETURN LOWER(TRIM(company1)) = LOWER(TRIM(company2));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 3: Add comment to explain the function
COMMENT ON FUNCTION compare_company IS 'Case-insensitive comparison of company values, handling NULL and whitespace';

COMMIT;

