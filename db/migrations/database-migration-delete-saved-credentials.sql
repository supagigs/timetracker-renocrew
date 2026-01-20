-- Migration: Delete saved_credentials table
-- This table is no longer needed as we're using Electron's localStorage with encryption
-- for "Remember me" functionality instead of database storage
-- Run this in your Supabase SQL editor

BEGIN;

-- Drop the trigger first
DROP TRIGGER IF EXISTS trigger_update_saved_credentials_updated_at ON saved_credentials;

-- Drop the function
DROP FUNCTION IF EXISTS update_saved_credentials_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_saved_credentials_user_email;

-- Drop RLS policies
DROP POLICY IF EXISTS "Allow all SELECT on saved_credentials" ON saved_credentials;
DROP POLICY IF EXISTS "Allow all INSERT on saved_credentials" ON saved_credentials;
DROP POLICY IF EXISTS "Allow all UPDATE on saved_credentials" ON saved_credentials;
DROP POLICY IF EXISTS "Allow all DELETE on saved_credentials" ON saved_credentials;

-- Drop the table
DROP TABLE IF EXISTS saved_credentials;

COMMIT;

-- Verification query (optional - run separately if needed):
-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_name = 'saved_credentials';
-- Should return no rows if table was successfully dropped

