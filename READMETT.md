# SupaTimeTracker – Quick Overview

Use this document as a rapid briefing for stakeholders who need the elevator pitch, feature checklist, and setup snapshot without reading the full README.

---

## What It Does
- Time tracking desktop app (Electron) + analytics portal (Next.js).
- Designed for teams where **clients** assign work to **freelancers**.
- Tracks active work, breaks, idle time, and captures periodic screenshots.
- Stores all data in Supabase (PostgreSQL + Storage) with Row Level Security.
- Syncs logout state between desktop and web so a user is never accidentally left signed in.

---

## Feature Highlights

| Area | Capabilities |
| ---- | ------------ |
| **Freelancers** | Clock in/out, select projects, automatic idle detection, break tracking, background screenshots, personal dashboards in the web portal. |
| **Clients** | Manage projects, assign freelancers, see team status, review timesheets, reports, and screenshot gallery. |
| **Shared** | Email-based auth, Supabase-powered storage, configurable reports URL, polished UI with responsive layouts. |

---

## Architecture Snapshot
- **Electron 38** front-end for timers and project administration.
- **Next.js 16 (App Router)** web portal for analytics and self-service reporting.
- **Supabase** for authentication, Postgres tables, realtime notifications, and screenshot storage.
- **Chart.js** for visualisations; **canvas/sharp** pipeline to compress screenshots before upload.

---

## Essential Setup
1. Run database migrations (see `README.md` for order).
2. Create `.env` in the root with Supabase credentials:
   ```env
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_ANON_KEY=<anon>
   SUPABASE_SERVICE_ROLE_KEY=<service-role>
   SUPABASE_STORAGE_BUCKET=screenshots
   REPORTS_URL=http://localhost:3000/reports
   ```
3. Provide the same values to the web portal via `time-tracker-reports/.env.local` (with `NEXT_PUBLIC_` prefixes).
4. Install dependencies and run:
   ```bash
   npm install
   npm run dev            # desktop app
   cd time-tracker-reports
   npm run dev            # reports portal
   ```

---

## Build & Distribution
- `npm run build` generates `dist/Time Tracker Setup <version>.exe`.
- Icons are defined in `package.json` (`SupagigsIcon.ico`/`.ico` by default). Swap files or update the paths as needed.
- `.env` is bundled automatically so make sure production keys are present before building.

---

## Troubleshooting at a Glance
- **Missing Supabase variables** → check `.env`, rebuild if packaged.
- **Symlink error** → enable Windows Developer Mode or run PowerShell as admin (`SYMLINK_FIX.md`).
- **Screenshots not uploading** → confirm service role key and storage bucket. The Electron console logs upload errors.
- **Logout not syncing** → ensure the `user_sessions` migration ran and CSP allows `wss://*.supabase.co` in all HTML screens.

For complete documentation see `README.md`, `BUILD_INSTRUCTIONS.md`, and `ENV_SETUP.md`.