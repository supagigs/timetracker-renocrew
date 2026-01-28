-- Migration: Add Frappe project and task ID columns to time_sessions
-- This allows tracking which Frappe project and task a time session is associated with
-- Run this in your Supabase SQL editor

-- Add frappe_project_id column to time_sessions
ALTER TABLE time_sessions 
ADD COLUMN IF NOT EXISTS frappe_project_id TEXT;

-- Add frappe_task_id column to time_sessions
ALTER TABLE time_sessions 
ADD COLUMN IF NOT EXISTS frappe_task_id TEXT;

-- Add frappe_timesheet_id column to time_sessions
ALTER TABLE time_sessions 
ADD COLUMN IF NOT EXISTS frappe_timesheet_id TEXT;

-- Add comments to explain the columns
COMMENT ON COLUMN time_sessions.frappe_project_id IS 'Frappe project ID (name) associated with this session';
COMMENT ON COLUMN time_sessions.frappe_task_id IS 'Frappe task ID (name) associated with this session';
COMMENT ON COLUMN time_sessions.frappe_timesheet_id IS 'Frappe timesheet ID (name) associated with this session';

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_time_sessions_frappe_project_id ON time_sessions(frappe_project_id);
CREATE INDEX IF NOT EXISTS idx_time_sessions_frappe_task_id ON time_sessions(frappe_task_id);
CREATE INDEX IF NOT EXISTS idx_time_sessions_frappe_timesheet_id ON time_sessions(frappe_timesheet_id);

