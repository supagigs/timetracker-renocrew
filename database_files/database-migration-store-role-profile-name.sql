-- Migration: Store role_profile_name from Frappe directly instead of converted role
-- This removes the constraint that limits role to 'Client' or 'Freelancer'
-- and allows storing the actual role_profile_name from Frappe (e.g., 'SuperAdmin', 'Freelancer', etc.)
-- Run this in your Supabase SQL editor

BEGIN;

-- Step 1: Drop the existing check constraint
ALTER TABLE users
DROP CONSTRAINT IF EXISTS check_role;

-- Step 2: Update comment to reflect that we store role_profile_name from Frappe
COMMENT ON COLUMN users.role IS 'User role_profile_name from Frappe (e.g., SuperAdmin, Freelancer, etc.). Stored as-is from Frappe User.role_profile_name field.';

COMMIT;

