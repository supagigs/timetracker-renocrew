# SupaTimeTracker

Modern time tracking for client/freelancer teams. The desktop app (Electron) records sessions, idle time, breaks, and screenshots while the companion web portal (Next.js) provides deep reports. Both surfaces stay in sync through Supabase.

---

## Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Database Migrations](#database-migrations)
- [Running Locally](#running-locally)
- [Building for Release](#building-for-release)
- [Cross-App Session Sync](#cross-app-session-sync)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Overview

SupaTimeTracker streamlines how distributed teams track billable work. Freelancers clock in from the desktop app, which automatically monitors activity and uploads screenshots to Supabase Storage. Clients jump into the reports portal to review progress, filter by project, or inspect timecards. Logout is synchronized between the desktop and web experiences so accounts cannot remain active in one surface while logged out of the other.

---

## Features

### Freelancers
- One-click clock in/out with automatic project association.
- Idle detection and break tracking ensure only focused time is captured.
- Background screenshots (configurable interval, default 30 minutes) stored in Supabase Storage.
- Local UI showing today's stats, session history, and active project list.
- View tailored overview, timesheet, reports, and screenshots inside the web portal.

### Clients (SuperAdmin)
- Unified reports navigation (Overview, Users, Reports, Projects, Timesheets, Screenshots, Settings) in the web portal.
- Team dashboards summarizing active/offline users and total hours.
- Per-session screenshots, filtered timesheets, and project performance metrics.
- Manage screenshot intervals per freelancer.

### Shared
- Frappe/ERPNext authentication and user management.
- Supabase for data storage (PostgreSQL + Storage).
- Local session persistence with secure preload IPC bridges.
- Configurable reports URL—desktop app opens the portal after verifying credentials.

---

## Tech Stack

| Layer            | Technology                        |
| ---------------- | --------------------------------- |
| Desktop UI       | Electron 38, vanilla HTML/CSS/JS  |
| Web portal       | Next.js 16, React 19, Tailwind CSS|
| Data backend     | Supabase (PostgreSQL + Storage)   |
| Charts           | Chart.js via `react-chartjs-2`    |
| IPC/Utilities    | Secure preload exposing minimal APIs|

---

## Quick Start

```bash
# clone + install dependencies
git clone https://github.com/supagigs/Supatimetracker.git
cd Supatimetracker
npm install

# install reports portal dependencies
cd time-tracker-reports
npm install
cd ..

# configure environment variables
copy .env.example .env          # create your file; see ENV_SETUP.md for values
code .env                       # edit with your Supabase credentials

# run both apps in development
npm run dev                     # starts Electron in dev mode
cd time-tracker-reports
npm run dev                     # starts Next.js on http://localhost:3000
```

> **Important:** ensure all database migrations have been executed in Supabase before testing (see below).

---

## Environment Variables

See `ENV_SETUP.md` for full details. At minimum the desktop app requires:

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # recommended for screenshot uploads
SUPABASE_STORAGE_BUCKET=screenshots
REPORTS_URL=http://localhost:3000/reports
```

The web portal expects matching values in `time-tracker-reports/.env.local` with `NEXT_PUBLIC_` prefixes. The service role key should stay server-side only.

---

## Database Migrations

Run the SQL files inside Supabase in this order:

1. `database-schema.sql` - Base schema
2. `database-migration-category-to-role.sql` - User roles
3. `database-migration-add-company-column.sql` - Company support
4. `database-migration-frappe-ids.sql` - Frappe integration
5. `database-migration-client-settings.sql` - Client settings
6. `database-migration-backfill-company.sql` - Backfill company data (optional)

The schema expects a Supabase Storage bucket named `screenshots`. See individual migration files for detailed descriptions.

---

## Running Locally

### Desktop App
- `npm run dev` – launches Electron with DevTools and hot reload.
- `npm start` – runs the production build in-place (useful after `npm run build`).

### Reports Portal
```bash
cd time-tracker-reports
npm run dev
```
Navigate to `http://localhost:3000`. The Electron app’s “View Reports” button should open the same URL if your `.env` uses the default `REPORTS_URL`.

---

## Building for Release

See `BUILD_INSTRUCTIONS.md` for step-by-step guidance. In summary:

1. Ensure `.env` contains production Supabase keys.
2. Update branding assets (`SupagigsIcon.ico/.ico`) or point `package.json` to your custom files.
3. Delete `dist/` if it exists.
4. Run `npm run build`.
5. Distribute `dist/Time Tracker Setup <version>.exe`.

The reports portal can be deployed independently using standard Next.js hosting workflows (Vercel, Netlify, Azure, etc.).

---

## Authentication

The application uses Frappe/ERPNext for authentication. Users must exist in Frappe and have the appropriate role profile:
- **SuperAdmin** role profile → treated as Client in the application
- Other role profiles → treated as Freelancer

Company information is fetched from Frappe's Employee doctype and used for multi-tenant data filtering.

---

## Project Structure

```
Supatimetracker/
├── main.js, preload.js                # Electron main process + secure bridge
├── renderer/                          # HTML/CSS/JS for desktop screens
│   ├── screens/                       # login, home, tracker, projects, etc.
│   ├── scripts/                       # front-end logic (idle tracking, Supabase)
│   └── styles/                        # global CSS
├── time-tracker-reports/              # Next.js reports portal (App Router)
│   └── src/app/reports/[userEmail]/   # Role-aware dashboards
├── database-migration-*.sql           # Supabase migrations
├── scripts/                           # Helper scripts (symlink fix, clean dist)
├── docs (this README + supporting guides)
└── package.json                       # Electron build config
```

---

## Troubleshooting

| Issue | Fix |
| ----- | --- |
| Red banner: “Missing Supabase environment variables” | Ensure `.env` exists with required keys, rebuild packaged apps. |
| `Cannot create symbolic link` during build | Enable Windows Developer Mode or run an elevated PowerShell session. See `SYMLINK_FIX.md`. |
| Screenshots not appearing | Confirm `SUPABASE_SERVICE_ROLE_KEY` is set, bucket exists, and migrations include user session + screenshot indexes. Check the Electron console (Ctrl+Shift+I) for upload errors. |
| Reports navigation missing items | Make sure `client_freelancer_assignments` and `user_sessions` migrations ran and the user has assignments in Supabase. |
| Desktop/web logout mismatch | Verify both apps point to the same Supabase project and realtime subscription succeeds (CSP allows `wss://*.supabase.co`). |

For additional reference see:
- `ENV_SETUP.md`
- `BUILD_INSTRUCTIONS.md`
- `CLIENT_FREELANCER_ASSIGNMENTS_README.md`
- `RUN_AS_ADMIN.md`
- `SYMLINK_FIX.md`

Happy tracking! ⏱️
