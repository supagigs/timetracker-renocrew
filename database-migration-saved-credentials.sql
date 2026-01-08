-- Migration: Create saved_credentials table for "Remember me" feature
-- This table stores encrypted user credentials for auto-login functionality
-- Run this in your Supabase SQL editor

BEGIN;

-- Create saved_credentials table
CREATE TABLE IF NOT EXISTS saved_credentials (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL UNIQUE,
  encrypted_email TEXT NOT NULL, -- Encrypted email (for verification)
  encrypted_password TEXT NOT NULL, -- Encrypted password
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_saved_credentials_user_email ON saved_credentials(user_email);

-- Enable RLS
ALTER TABLE saved_credentials ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (permissive for Electron app)
-- Note: In production, you may want to add more restrictive policies
DROP POLICY IF EXISTS "Allow all SELECT on saved_credentials" ON saved_credentials;
DROP POLICY IF EXISTS "Allow all INSERT on saved_credentials" ON saved_credentials;
DROP POLICY IF EXISTS "Allow all UPDATE on saved_credentials" ON saved_credentials;
DROP POLICY IF EXISTS "Allow all DELETE on saved_credentials" ON saved_credentials;

CREATE POLICY "Allow all SELECT on saved_credentials" ON saved_credentials FOR SELECT USING (true);
CREATE POLICY "Allow all INSERT on saved_credentials" ON saved_credentials FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all UPDATE on saved_credentials" ON saved_credentials FOR UPDATE USING (true);
CREATE POLICY "Allow all DELETE on saved_credentials" ON saved_credentials FOR DELETE USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_saved_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_saved_credentials_updated_at ON saved_credentials;
CREATE TRIGGER trigger_update_saved_credentials_updated_at
  BEFORE UPDATE ON saved_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_credentials_updated_at();

-- Add comments
COMMENT ON TABLE saved_credentials IS 'Stores encrypted user credentials for Remember Me functionality';
COMMENT ON COLUMN saved_credentials.user_email IS 'User email (plain text, used as unique identifier)';
COMMENT ON COLUMN saved_credentials.encrypted_email IS 'Encrypted email (stored for verification purposes)';
COMMENT ON COLUMN saved_credentials.encrypted_password IS 'Encrypted password (AES-256-GCM encryption)';

COMMIT;

-- Verification queries (optional - run separately if needed):
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'saved_credentials';

