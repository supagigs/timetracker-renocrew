-- Test queries to diagnose the users table issue
-- Run these in Supabase SQL Editor one at a time

-- 1. First, verify the table exists and check its structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Test a simple SELECT (should work if RLS is correct)
SELECT * FROM users LIMIT 1;

-- 3. Test the exact query the app is making
SELECT * FROM users WHERE email = 'ridhi@gmail.com';

-- 4. Test with maybeSingle equivalent (limit 1)
SELECT * FROM users WHERE email = 'ridhi@gmail.com' LIMIT 1;

-- 5. Check if there are any views on users
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND (table_name LIKE '%user%' OR table_name = 'users');

-- 6. Verify RLS policies are correct
SELECT 
    policyname,
    cmd,
    CASE 
        WHEN qual IS NOT NULL THEN qual::text
        ELSE 'NULL'
    END as using_clause,
    CASE 
        WHEN with_check IS NOT NULL THEN with_check::text
        ELSE 'NULL'
    END as with_check_clause
FROM pg_policies
WHERE tablename = 'users';

-- 7. Try to disable RLS temporarily to test (ONLY FOR TESTING - re-enable after!)
-- ALTER TABLE users DISABLE ROW LEVEL SECURITY;
-- Then test: SELECT * FROM users WHERE email = 'ridhi@gmail.com';
-- Then re-enable: ALTER TABLE users ENABLE ROW LEVEL SECURITY;

