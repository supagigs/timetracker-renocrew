-- Time Tracker Database Schema
-- Run these commands in your Supabase SQL editor

-- Clear all existing data
DELETE FROM time_logs;
DELETE FROM tasks;
DELETE FROM users;

-- Drop existing tables (optional - only if you want to start completely fresh)
DROP TABLE IF EXISTS time_logs;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS users;

-- Create new simplified schema
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  category TEXT CHECK (category IN ('Client', 'Freelancer')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE time_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  break_duration INTEGER DEFAULT 0, -- in seconds
  active_duration INTEGER DEFAULT 0, -- in seconds
  session_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE screenshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id INTEGER REFERENCES time_sessions(id),
  screenshot_data TEXT NOT NULL, -- base64 encoded image
  captured_at TIMESTAMP DEFAULT NOW(),
  app_name TEXT
);

CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  project_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, project_name)
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own data" ON users FOR SELECT USING (email = auth.jwt() ->> 'email');
CREATE POLICY "Users can insert own data" ON users FOR INSERT WITH CHECK (email = auth.jwt() ->> 'email');
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (email = auth.jwt() ->> 'email');

CREATE POLICY "Allow all SELECT on time_sessions" ON time_sessions FOR SELECT USING (true);
CREATE POLICY "Allow all INSERT on time_sessions" ON time_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all UPDATE on time_sessions" ON time_sessions FOR UPDATE USING (true);

CREATE POLICY "Allow all SELECT on screenshots" ON screenshots FOR SELECT USING (true);
CREATE POLICY "Allow all INSERT on screenshots" ON screenshots FOR INSERT WITH CHECK (true);

-- Note: Using permissive policies since Electron app uses anon key without auth
-- For production with proper auth, tie policies to user_id
CREATE POLICY "Allow all SELECT on projects" ON projects FOR SELECT USING (true);
CREATE POLICY "Allow all INSERT on projects" ON projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all UPDATE on projects" ON projects FOR UPDATE USING (true);
CREATE POLICY "Allow all DELETE on projects" ON projects FOR DELETE USING (true);

-- Create indexes for better performance
CREATE INDEX idx_time_sessions_user_id ON time_sessions(user_id);
CREATE INDEX idx_time_sessions_session_date ON time_sessions(session_date);
CREATE INDEX idx_screenshots_user_id ON screenshots(user_id);
CREATE INDEX idx_screenshots_session_id ON screenshots(session_id);
CREATE INDEX idx_projects_user_id ON projects(user_id);









