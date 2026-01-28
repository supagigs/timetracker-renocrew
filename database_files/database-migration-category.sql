-- Migration: Add category column to users table
-- Run this in your Supabase SQL editor

-- Add category column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS category TEXT;

-- Add a check constraint to ensure category is either 'Client' or 'Freelancer' (optional but recommended)
ALTER TABLE users
ADD CONSTRAINT check_category 
CHECK (category IS NULL OR category IN ('Client', 'Freelancer'));

-- Add comment to document the column
COMMENT ON COLUMN users.category IS 'User category: Client or Freelancer. Set during signup for new users.';



