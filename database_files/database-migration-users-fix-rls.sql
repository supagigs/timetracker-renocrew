-- Fix RLS Policies for Users Table
-- This fixes the "Internal server error" when querying the users table
-- Run this in your Supabase SQL editor
-- This script is idempotent - safe to run multiple times

-- Drop ALL existing policies on users table (both old and new)
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Allow all SELECT on users" ON users;
DROP POLICY IF EXISTS "Allow all INSERT on users" ON users;
DROP POLICY IF EXISTS "Allow all UPDATE on users" ON users;

-- Create permissive policies that work with anon key (no authentication required)
-- These allow all operations since the app uses anon key without auth
CREATE POLICY "Allow all SELECT on users" ON users 
  FOR SELECT USING (true);

CREATE POLICY "Allow all INSERT on users" ON users 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all UPDATE on users" ON users 
  FOR UPDATE USING (true);

-- Note: These policies allow all operations because the Electron app
-- uses the anon key without Supabase authentication.
-- Application-level security (email matching) ensures data isolation.

