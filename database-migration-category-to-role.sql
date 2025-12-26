-- Migration: Replace category column with role column
-- This migration adds a role column, migrates existing category data to role,
-- and then drops the category column
-- Run this in your Supabase SQL editor

BEGIN;

-- Step 1: Add role column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role TEXT;

-- Step 2: Migrate existing category data to role
UPDATE users 
SET role = category 
WHERE category IS NOT NULL;

-- Step 3: Drop the old category constraint if it exists
ALTER TABLE users 
DROP CONSTRAINT IF EXISTS check_category;

-- Step 4: Add check constraint for role column
ALTER TABLE users
ADD CONSTRAINT check_role 
CHECK (role IS NULL OR role IN ('Client', 'Freelancer'));

-- Step 5: Add comment to document the role column
COMMENT ON COLUMN users.role IS 'User role: Client or Freelancer. Determined from Frappe roles during login.';

-- Step 6: Drop the category column (after data migration)
ALTER TABLE users 
DROP COLUMN IF EXISTS category;

COMMIT;

