-- Migration: Add client-freelancer assignments
-- This stores which freelancer works under which client
-- Run this in your Supabase SQL editor

-- Create client_freelancer_assignments table
CREATE TABLE IF NOT EXISTS client_freelancer_assignments (
  id SERIAL PRIMARY KEY,
  client_email TEXT NOT NULL, -- Email of the client
  freelancer_email TEXT NOT NULL, -- Email of the freelancer
  assigned_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE, -- Allow deactivating assignments without deleting
  UNIQUE(client_email, freelancer_email)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_client_freelancer_assignments_client_email 
  ON client_freelancer_assignments(client_email);
CREATE INDEX IF NOT EXISTS idx_client_freelancer_assignments_freelancer_email 
  ON client_freelancer_assignments(freelancer_email);
CREATE INDEX IF NOT EXISTS idx_client_freelancer_assignments_active 
  ON client_freelancer_assignments(is_active) WHERE is_active = TRUE;

-- Enable RLS
ALTER TABLE client_freelancer_assignments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (permissive for anon key usage)
DROP POLICY IF EXISTS "Allow all SELECT on client_freelancer_assignments" ON client_freelancer_assignments;
DROP POLICY IF EXISTS "Allow all INSERT on client_freelancer_assignments" ON client_freelancer_assignments;
DROP POLICY IF EXISTS "Allow all UPDATE on client_freelancer_assignments" ON client_freelancer_assignments;
DROP POLICY IF EXISTS "Allow all DELETE on client_freelancer_assignments" ON client_freelancer_assignments;

CREATE POLICY "Allow all SELECT on client_freelancer_assignments" ON client_freelancer_assignments 
  FOR SELECT USING (true);

CREATE POLICY "Allow all INSERT on client_freelancer_assignments" ON client_freelancer_assignments 
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all UPDATE on client_freelancer_assignments" ON client_freelancer_assignments 
  FOR UPDATE USING (true);

CREATE POLICY "Allow all DELETE on client_freelancer_assignments" ON client_freelancer_assignments 
  FOR DELETE USING (true);

-- Add comment
COMMENT ON TABLE client_freelancer_assignments IS 'Stores which freelancer works under which client. This is the primary relationship table for client-freelancer assignments.';

-- Optional: Migrate existing relationships from project_assignments
-- This will create client-freelancer assignments based on existing project assignments
INSERT INTO client_freelancer_assignments (client_email, freelancer_email, assigned_at)
SELECT DISTINCT 
  assigned_by AS client_email,
  freelancer_email,
  MIN(assigned_at) AS assigned_at
FROM project_assignments
WHERE NOT EXISTS (
  SELECT 1 FROM client_freelancer_assignments cfa
  WHERE cfa.client_email = project_assignments.assigned_by
    AND cfa.freelancer_email = project_assignments.freelancer_email
)
GROUP BY assigned_by, freelancer_email
ON CONFLICT (client_email, freelancer_email) DO NOTHING;





















