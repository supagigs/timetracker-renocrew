-- Migration: Switch to user_id foreign keys and backfill from users.email
-- Run sections in order inside a transaction if possible

BEGIN;

-- 1) time_sessions: add user_id, backfill, enforce, drop old column
ALTER TABLE time_sessions ADD COLUMN IF NOT EXISTS user_id INTEGER;
UPDATE time_sessions ts
SET user_id = u.id
FROM users u
WHERE ts.user_id IS NULL AND ts.user_email = u.email;
ALTER TABLE time_sessions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE time_sessions ADD CONSTRAINT fk_time_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS idx_time_sessions_user_email;
ALTER TABLE time_sessions DROP COLUMN IF EXISTS user_email;
CREATE INDEX IF NOT EXISTS idx_time_sessions_user_id ON time_sessions(user_id);

-- 2) screenshots: add user_id, backfill, enforce, drop old column
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS user_id INTEGER;
UPDATE screenshots s
SET user_id = u.id
FROM users u
WHERE s.user_id IS NULL AND s.user_email = u.email;
ALTER TABLE screenshots ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE screenshots ADD CONSTRAINT fk_screenshots_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS idx_screenshots_user_email;
ALTER TABLE screenshots DROP COLUMN IF EXISTS user_email;
CREATE INDEX IF NOT EXISTS idx_screenshots_user_id ON screenshots(user_id);

-- 3) projects: if exists with user_email, migrate structure
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id INTEGER;
UPDATE projects p
SET user_id = u.id
FROM users u
WHERE p.user_id IS NULL AND p.user_email = u.email;
ALTER TABLE projects ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE projects ADD CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
-- swap unique constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_user_email_project_name_key'
  ) THEN
    ALTER TABLE projects DROP CONSTRAINT projects_user_email_project_name_key;
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- ignore
END$$;
CREATE UNIQUE INDEX IF NOT EXISTS projects_user_id_project_name_key ON projects(user_id, project_name);
DROP INDEX IF EXISTS idx_projects_user_email;
ALTER TABLE projects DROP COLUMN IF EXISTS user_email;
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

COMMIT;


