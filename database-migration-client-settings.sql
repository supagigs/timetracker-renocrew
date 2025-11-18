-- Migration: Add client_settings for per-client screenshot interval
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS client_settings (
  id SERIAL PRIMARY KEY,
  client_email TEXT NOT NULL UNIQUE,
  screenshot_interval_seconds INTEGER NOT NULL DEFAULT 20,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_settings_client_email
  ON client_settings(client_email);

ALTER TABLE client_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all SELECT on client_settings" ON client_settings;
DROP POLICY IF EXISTS "Allow all INSERT on client_settings" ON client_settings;
DROP POLICY IF EXISTS "Allow all UPDATE on client_settings" ON client_settings;

CREATE POLICY "Allow all SELECT on client_settings" ON client_settings
  FOR SELECT USING (true);

CREATE POLICY "Allow all INSERT on client_settings" ON client_settings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all UPDATE on client_settings" ON client_settings
  FOR UPDATE USING (true);

COMMENT ON TABLE client_settings IS 'Per-client configuration such as screenshot capture interval.';





