-- Migration: Add company column to all tables
-- This stores the company fetched from Frappe for multi-tenant support
-- Run this in your Supabase SQL editor

BEGIN;

-- Add company column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS company TEXT;

-- Add company column to time_sessions table
ALTER TABLE time_sessions 
ADD COLUMN IF NOT EXISTS company TEXT;

-- Add company column to screenshots table
ALTER TABLE screenshots 
ADD COLUMN IF NOT EXISTS company TEXT;

-- Create indexes for company column on main tables for better query performance
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company);
CREATE INDEX IF NOT EXISTS idx_time_sessions_company ON time_sessions(company);
CREATE INDEX IF NOT EXISTS idx_screenshots_company ON screenshots(company);

-- Add comments to explain the column
COMMENT ON COLUMN users.company IS 'Company name fetched from Frappe User doctype';
COMMENT ON COLUMN time_sessions.company IS 'Company name fetched from Frappe User doctype';
COMMENT ON COLUMN screenshots.company IS 'Company name fetched from Frappe User doctype';

COMMIT;

