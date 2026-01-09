-- Create client_settings table for storing manager screenshot interval settings
-- This table stores per-employee screenshot intervals for each manager/client

CREATE TABLE IF NOT EXISTS client_settings (
  client_email TEXT PRIMARY KEY,
  employee_intervals JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on client_email for faster lookups (though it's already the primary key)
CREATE INDEX IF NOT EXISTS idx_client_settings_client_email ON client_settings(client_email);

-- Add comment to table
COMMENT ON TABLE client_settings IS 'Stores screenshot interval settings for managers, with per-employee interval configurations';

-- Add comments to columns
COMMENT ON COLUMN client_settings.client_email IS 'Email of the manager/client (normalized to lowercase)';
COMMENT ON COLUMN client_settings.employee_intervals IS 'JSON object mapping employee emails (lowercase) to screenshot interval in seconds';
COMMENT ON COLUMN client_settings.updated_at IS 'Timestamp of when the settings were last updated';

