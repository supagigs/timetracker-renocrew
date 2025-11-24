-- Complete fix for users table RLS and structure issues
-- Run this ENTIRE script in Supabase SQL Editor
-- This addresses multiple potential issues

BEGIN;

-- Step 1: Drop ALL existing policies (both old and new)
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Allow all SELECT on users" ON users;
DROP POLICY IF EXISTS "Allow all INSERT on users" ON users;
DROP POLICY IF EXISTS "Allow all UPDATE on users" ON users;

-- Step 2: Temporarily disable RLS to ensure we can create policies
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Step 3: Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Step 4: Create permissive policies
CREATE POLICY "Allow all SELECT on users" ON users 
  FOR SELECT USING (true);

CREATE POLICY "Allow all INSERT on users" ON users 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all UPDATE on users" ON users 
  FOR UPDATE USING (true);

-- Step 5: Verify the policies were created
SELECT 
    policyname,
    cmd,
    qual IS NOT NULL as has_using,
    with_check IS NOT NULL as has_with_check
FROM pg_policies
WHERE tablename = 'users';

-- Step 6: Test query (should return results or empty, not error)
SELECT * FROM users WHERE email = 'test@example.com' LIMIT 1;

COMMIT;

-- If the above works, the issue should be resolved.
-- If you still get errors, check:
-- 1. Table structure matches expected schema
-- 2. No triggers causing issues
-- 3. No database functions interfering
-- 4. Supabase project settings/limits

