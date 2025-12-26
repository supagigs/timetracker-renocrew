-- Migration: Create user_context table for caching Frappe user context
-- This table stores user profile information from Frappe to avoid repeated API calls
-- Run this in your Supabase SQL editor

BEGIN;

-- Create user_context table
CREATE TABLE IF NOT EXISTS user_context (
  email TEXT PRIMARY KEY,
  full_name TEXT,
  role_profile TEXT,
  company TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_context_email ON user_context(email);
CREATE INDEX IF NOT EXISTS idx_user_context_role_profile ON user_context(role_profile);

-- Enable RLS
ALTER TABLE user_context ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (permissive for anon key usage)
-- For production with proper auth, tie policies to authenticated users
DROP POLICY IF EXISTS "Allow all SELECT on user_context" ON user_context;
DROP POLICY IF EXISTS "Allow all INSERT on user_context" ON user_context;
DROP POLICY IF EXISTS "Allow all UPDATE on user_context" ON user_context;

CREATE POLICY "Allow all SELECT on user_context" ON user_context 
  FOR SELECT USING (true);

CREATE POLICY "Allow all INSERT on user_context" ON user_context 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all UPDATE on user_context" ON user_context 
  FOR UPDATE USING (true);

-- Add comment to explain the table
COMMENT ON TABLE user_context IS 'Cached user context from Frappe. Stores email, full_name, role_profile, and company to avoid repeated API calls.';

COMMIT;

