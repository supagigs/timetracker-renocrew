-- Migration: Add index on captured_at for screenshot cleanup queries
-- This index is critical for the automatic cleanup of old screenshots
-- Run this in your Supabase SQL editor

-- Index for efficient queries filtering by captured_at (used by cleanup process)
CREATE INDEX IF NOT EXISTS idx_screenshots_captured_at 
ON screenshots(captured_at);

-- Add comment to explain the index
COMMENT ON INDEX idx_screenshots_captured_at IS 'Index for efficient cleanup queries filtering screenshots by captured_at timestamp';









