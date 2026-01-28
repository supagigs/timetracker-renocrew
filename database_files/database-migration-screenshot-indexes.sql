-- Add composite indexes for better screenshot query performance
-- Run this in your Supabase SQL editor

-- Composite index for screenshots table to optimize queries by session_id and user_email
CREATE INDEX IF NOT EXISTS idx_screenshots_session_user_email 
ON screenshots(session_id, user_email);

-- Composite index for screenshots table to optimize queries by user_email and captured_at
CREATE INDEX IF NOT EXISTS idx_screenshots_user_email_captured_at 
ON screenshots(user_email, captured_at);

-- Composite index for screenshots table to optimize queries by session_id, user_email, and captured_at
CREATE INDEX IF NOT EXISTS idx_screenshots_session_user_captured 
ON screenshots(session_id, user_email, captured_at);

-- Add comment to explain the indexes
COMMENT ON INDEX idx_screenshots_session_user_email IS 'Composite index for efficient screenshot queries by session and user';
COMMENT ON INDEX idx_screenshots_user_email_captured_at IS 'Composite index for efficient screenshot queries by user and time';
COMMENT ON INDEX idx_screenshots_session_user_captured IS 'Composite index for efficient screenshot queries by session, user, and time';




