-- Migration: Drop user_context and user_sessions tables
-- Run this in your Supabase SQL editor
--
-- WARNING: This will permanently delete all data in these tables.
-- Make sure you have a backup if you need to recover this data later.

BEGIN;

-- Drop RLS policies for user_context table
DROP POLICY IF EXISTS "Allow all SELECT on user_context" ON user_context;
DROP POLICY IF EXISTS "Allow all INSERT on user_context" ON user_context;
DROP POLICY IF EXISTS "Allow all UPDATE on user_context" ON user_context;

-- Drop indexes for user_context table
DROP INDEX IF EXISTS idx_user_context_email;
DROP INDEX IF EXISTS idx_user_context_role_profile;

-- Drop user_context table
DROP TABLE IF EXISTS user_context CASCADE;

-- Drop RLS policies for user_sessions table
DROP POLICY IF EXISTS "Allow select on user_sessions" ON user_sessions;
DROP POLICY IF EXISTS "Allow insert on user_sessions" ON user_sessions;
DROP POLICY IF EXISTS "Allow update on user_sessions" ON user_sessions;

-- Drop indexes for user_sessions table
DROP INDEX IF EXISTS idx_user_sessions_updated_at;

-- Drop user_sessions table
DROP TABLE IF EXISTS user_sessions CASCADE;

COMMIT;

