# Time Tracker Reports Portal

Next.js web portal for viewing time tracking reports, screenshots, and analytics.

## Overview

This is the companion web application for the SupaTimeTracker desktop app. It provides role-based dashboards for viewing time tracking data, screenshots, and generating reports.

## Features

- **Role-based Navigation**: Different views for Clients (SuperAdmin) and Freelancers
- **Dashboard Views**: Overview, Users, Reports, Projects, Timesheets, Screenshots, Settings
- **Real-time Data**: Fetches data from Supabase and Frappe
- **Responsive Design**: Works on desktop and mobile devices

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file with environment variables:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
FRAPPE_URL=your_frappe_url
FRAPPE_API_KEY=your_api_key
FRAPPE_API_SECRET=your_api_secret
```

3. Run development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
npm start
```

## Project Structure

```
time-tracker-reports/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── api/               # API routes
│   │   └── reports/           # Reports pages
│   ├── components/            # React components
│   └── lib/                   # Utilities and clients
├── scripts/                   # Utility scripts
└── public/                    # Static assets
```

For more information, see the main [README.md](../README.md) in the project root.
