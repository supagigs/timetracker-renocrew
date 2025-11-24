-- Check current RLS policies on users table
-- Run this in Supabase SQL Editor to verify the current policies

-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'users';

-- List all policies on users table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'users'
ORDER BY policyname;

-- Expected result after migration:
-- Should see policies like:
-- - "Allow all SELECT on users" (SELECT, USING (true))
-- - "Allow all INSERT on users" (INSERT, WITH CHECK (true))
-- - "Allow all UPDATE on users" (UPDATE, USING (true))
--
-- If you see policies with "auth.jwt()" in them, the migration hasn't been applied yet.

