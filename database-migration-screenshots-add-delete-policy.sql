-- Migration: Add DELETE policy for screenshots table
-- This is required for the automatic cleanup of old screenshots to work
-- Run this in your Supabase SQL editor

-- Add DELETE policy for screenshots (allows cleanup operations)
CREATE POLICY "Allow all DELETE on screenshots" ON screenshots
  FOR DELETE USING (true);

-- Add comment to explain the policy
COMMENT ON POLICY "Allow all DELETE on screenshots" ON screenshots IS 
  'Allows deletion of screenshots for cleanup operations. The Electron app uses service role key which bypasses RLS, but this policy ensures cleanup operations work correctly.';



