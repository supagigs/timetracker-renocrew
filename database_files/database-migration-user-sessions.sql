-- Migration: Create user_sessions table for cross-platform sign-out sync
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS user_sessions (
  email TEXT PRIMARY KEY,
  web_logged_in BOOLEAN NOT NULL DEFAULT FALSE,
  app_logged_in BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now())
);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Permissive policies (desktop app uses anon key)
DROP POLICY IF EXISTS "Allow select on user_sessions" ON user_sessions;
DROP POLICY IF EXISTS "Allow insert on user_sessions" ON user_sessions;
DROP POLICY IF EXISTS "Allow update on user_sessions" ON user_sessions;

CREATE POLICY "Allow select on user_sessions"
  ON user_sessions
  FOR SELECT
  USING (true);

CREATE POLICY "Allow insert on user_sessions"
  ON user_sessions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update on user_sessions"
  ON user_sessions
  FOR UPDATE
  USING (true);

CREATE INDEX IF NOT EXISTS idx_user_sessions_updated_at ON user_sessions(updated_at DESC);


