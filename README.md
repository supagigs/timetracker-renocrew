# SupaTimeTracker ⏱️

A comprehensive time tracking desktop application built with Electron and Supabase, designed for managing work time between Clients and Freelancers. The app features automatic idle detection, break tracking, screenshot capture, and detailed reporting.

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [User Roles](#user-roles)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Reports Dashboard](#reports-dashboard)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

SupaTimeTracker is a desktop application that helps Clients manage projects and track the time spent by Freelancers on their work. The app automatically tracks active work time, idle time, breaks, and captures periodic screenshots for transparency and accountability.

### Main Components

1. **Electron Desktop App**: The main time tracking application
2. **Reports Dashboard**: A Next.js web application for viewing detailed reports and analytics

## ✨ Key Features

### For Freelancers

- ⏱️ **Automatic Time Tracking**: Start/stop timer with project selection
- 🎯 **Project-Based Tracking**: Track time spent on specific projects
- 🔍 **Idle Detection**: Automatically detects when you're idle and pauses tracking
- ☕ **Break Management**: Take breaks that are tracked separately
- 📸 **Automatic Screenshots**: Periodic screenshots captured during work sessions
- 📊 **Real-time Statistics**: View today's work statistics, active time, idle time, and break duration
- 📈 **Project Distribution Charts**: Visual pie charts showing time distribution across projects
- 🏠 **Session Management**: Clock in/out with session persistence

### For Clients

- 📁 **Project Management**: Create and manage multiple projects
- 👥 **Freelancer Assignment**: Assign projects to freelancers
- 📊 **Reports Dashboard**: View detailed reports of all freelancers' work
- 🔍 **Freelancer Selection**: Select any freelancer from a dropdown to view their monthly reports
- 📸 **Screenshot Review**: View screenshots captured during work sessions
- ⏱️ **Time Analytics**: See total work time, idle percentage, and project-wise breakdowns

### General Features

- 🔐 **User Authentication**: Secure login with email and user category (Client/Freelancer)
- 💾 **Cloud Storage**: All data stored in Supabase (PostgreSQL)
- 📱 **Cross-Platform**: Works on Windows, macOS, and Linux
- 🎨 **Modern UI**: Beautiful dark theme with smooth animations
- 🔔 **Notifications**: Real-time notifications for important actions
- 📈 **Monthly Reports**: 30-day activity summaries with charts and statistics

## 👥 User Roles

### Client

Clients can:
- Create and manage projects
- Assign projects to freelancers
- View reports for all assigned freelancers
- See time distribution and project breakdowns
- Review screenshots from work sessions

### Freelancer

Freelancers can:
- Clock in/out for work sessions
- Select projects to work on
- Track active work time automatically
- Take breaks (tracked separately)
- View their own statistics and reports
- See time distribution across projects

## 📦 Prerequisites

- **Node.js** (version 16 or higher)
- **npm** or **yarn**
- **Supabase Account**: Create a free account at [supabase.com](https://supabase.com)
- **Git** (for cloning the repository)

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/supagigs/Supatimetracker.git
cd Supatimetracker
```

### 2. Install Dependencies

```bash
# Install Electron app dependencies
npm install

# Install Reports dashboard dependencies
cd time-tracker-reports
npm install
cd ..
```

### 3. Set Up Supabase

1. Create a new project in [Supabase Dashboard](https://app.supabase.com)
2. Note down your project URL and anon key
3. Create a `.env` file in the root directory:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
REPORTS_URL=http://localhost:3000/reports
```

### 4. Set Up Database

Run the SQL migrations in your Supabase SQL Editor in this order:

1. **Base Schema**: `database-schema.sql`
2. **User Categories**: `database-migration-category.sql`
3. **Projects**: `database-migration-projects.sql`
4. **Idle Time**: `database-migration-idle-time.sql`
5. **Break Count**: `database-migration-break-count.sql`
6. **Project Assignments**: `database-migration-project-assignments.sql`
7. **Client-Freelancer Assignments**: `database-migration-client-freelancer-assignments.sql`
8. **Screenshot Indexes**: `database-migration-screenshot-indexes.sql`

> **Note**: See [Database Setup](#database-setup) section for detailed instructions.

## 🗄️ Database Setup

### Quick Setup

Run all migration files in your Supabase SQL Editor in the order listed above. Each migration file includes comments explaining what it does.

### Manual Setup

If you prefer to set up manually, refer to `database-schema.sql` for the base schema and run each migration file individually.

### Key Tables

- **users**: User accounts with email, display name, and category
- **projects**: Projects created by clients
- **project_assignments**: Links projects to freelancers
- **client_freelancer_assignments**: Tracks which freelancers work for which clients
- **time_sessions**: Work sessions with active, idle, and break durations
- **screenshots**: Periodic screenshots captured during work

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# Reports Dashboard URL (for opening reports in browser)
REPORTS_URL=http://localhost:3000/reports
```

### Reports Dashboard Configuration

For production, update the `REPORTS_URL` to point to your deployed Next.js app:

```env
REPORTS_URL=https://your-reports-domain.com/reports
```

## 💻 Usage

### Running the Desktop App

#### Development Mode

```bash
npm run dev
```

This will start the Electron app with DevTools open for debugging.

#### Production Mode

```bash
npm start
```

### Running the Reports Dashboard

```bash
cd time-tracker-reports
npm run dev
```

The dashboard will be available at `http://localhost:3000`

### Building for Production

#### Desktop App

```bash
npm run build
```

This creates distributable packages in the `dist` folder.

#### Reports Dashboard

```bash
cd time-tracker-reports
npm run build
npm start
```

### How to Use

#### For Freelancers

1. **Login**: Enter your email and select "Freelancer" category
2. **Set Display Name**: Enter your name (first time only)
3. **Clock In**: 
   - Click "Clock In" from the home screen
   - Select a project from the dropdown
   - Click "Start Work Session"
4. **Work**: The timer automatically tracks your active time
5. **Take Breaks**: Click "Take Break" when needed
6. **Clock Out**: Click "Clock Out" to end your session
7. **View Reports**: Click "View Reports" to see your monthly statistics

#### For Clients

1. **Login**: Enter your email and select "Client" category
2. **Set Display Name**: Enter your name (first time only)
3. **Manage Projects**:
   - Click "Projects" from the home screen
   - Click "Add Project" to create new projects
   - Click "Assign to Freelancer" to assign projects
4. **View Reports**:
   - Click "View Reports" from the home screen
   - Select a freelancer from the dropdown
   - View their monthly reports, time distribution, and screenshots

## 📁 Project Structure

```
Supatimetracker/
├── main.js                          # Electron main process
├── preload.js                       # Preload script for secure IPC
├── package.json                     # App dependencies and scripts
├── SupagigsLogo.png                 # App icon
│
├── renderer/                        # Renderer process (UI)
│   ├── screens/                     # HTML screens
│   │   ├── login.html              # Login screen
│   │   ├── displayName.html        # Display name setup
│   │   ├── home.html               # Home screen
│   │   ├── clockIn.html            # Clock in screen
│   │   ├── tracker.html            # Active timer screen
│   │   ├── projects.html           # Projects management (Clients)
│   │   └── report.html             # Reports screen (Electron)
│   │
│   ├── scripts/                     # JavaScript logic
│   │   ├── supabaseClient.js       # Supabase initialization
│   │   ├── utils.js                 # Utility functions
│   │   ├── login.js                 # Login logic
│   │   ├── home.js                  # Home screen logic
│   │   ├── clockIn.js               # Clock in logic
│   │   ├── tracker.js               # Timer tracking logic
│   │   ├── projects.js              # Projects management
│   │   ├── report.js                # Reports logic
│   │   └── idleTracker.js           # Idle detection
│   │
│   └── styles/                      # CSS styles
│       └── common.css               # Common styles
│
├── time-tracker-reports/            # Next.js Reports Dashboard
│   ├── src/
│   │   ├── app/
│   │   │   └── reports/
│   │   │       └── [userEmail]/    # Dynamic reports page
│   │   ├── components/              # React components
│   │   │   ├── SummaryCard.tsx
│   │   │   ├── WeeklyActivityChart.tsx
│   │   │   ├── ScreenshotSelector.tsx
│   │   │   └── FreelancerSelector.tsx
│   │   └── lib/
│   │       └── supabaseServer.ts    # Supabase server client
│   └── package.json
│
├── database-schema.sql              # Base database schema
├── database-migration-*.sql         # Database migration files
└── README.md                        # This file
```

## 📊 Reports Dashboard

The Reports Dashboard is a Next.js web application that provides detailed analytics and visualizations.

### Features

- **Monthly Reports**: View last 30 days of activity
- **Time Breakdown**: Total work time, average daily work, idle percentage
- **Project Analytics**: Time distribution across projects
- **Daily Activity Charts**: Bar charts showing daily active and idle hours
- **Project Charts**: Visual breakdown of time spent per project
- **Screenshot Gallery**: View screenshots from work sessions
- **Freelancer Selection**: Clients can select any freelancer to view their reports

### Accessing Reports

1. **From Desktop App**: Click "View Reports" button
2. **Direct URL**: Navigate to `http://localhost:3000/reports/[userEmail]`
3. **For Clients**: Use the dropdown to select a freelancer

## 🔧 Troubleshooting

### Common Issues

#### App Won't Start

- Ensure Node.js (v16+) is installed: `node --version`
- Install dependencies: `npm install`
- Check for error messages in the terminal

#### Can't Connect to Supabase

- Verify `.env` file exists with correct credentials
- Check internet connection
- Verify Supabase project is active
- Ensure all database tables are created

#### Timer Not Working

- Check browser console for errors (Ctrl+Shift+I or Cmd+Option+I)
- Verify you've selected a project (for freelancers)
- Ensure you're logged in with correct user category

#### Reports Not Loading

- Ensure Reports Dashboard is running: `cd time-tracker-reports && npm run dev`
- Check `REPORTS_URL` in `.env` matches the dashboard URL
- Verify user email is correctly encoded in the URL

#### Database Errors

- Run all migration files in order
- Check Supabase SQL Editor for error messages
- Verify Row Level Security (RLS) policies are set correctly
- Ensure `client_freelancer_assignments` table exists for client-freelancer relationships

#### Screenshots Not Capturing

- Check system permissions for screen capture
- Verify `screenshots` table exists in database
- Check console for permission errors

### Development Tips

- **Enable DevTools**: Use `npm run dev` for automatic DevTools
- **Check Console**: Most errors are logged to the console
- **Database Logs**: Check Supabase dashboard for query errors
- **Network Tab**: Use browser DevTools Network tab to debug API calls

## 🔐 Security Notes

- The app uses Supabase's Row Level Security (RLS) policies
- All API keys are stored in `.env` (never commit this file)
- Screenshots are stored as base64 in the database
- User authentication is handled through Supabase

## 📝 Migration Guide

If you're upgrading from an older version:

1. Backup your database
2. Run new migration files in order
3. Update your `.env` file if needed
4. Restart the application

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test thoroughly
5. Commit your changes: `git commit -m 'Add feature'`
6. Push to the branch: `git push origin feature-name`
7. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review the database migration files for setup issues
3. Check Supabase dashboard for database errors
4. Open an issue on GitHub with:
   - Error messages
   - Steps to reproduce
   - Your environment (OS, Node version)

## 🎯 Roadmap

Future enhancements may include:

- [ ] Team management features
- [ ] Invoice generation
- [ ] Export reports to PDF/CSV
- [ ] Mobile app companion
- [ ] Advanced analytics and insights
- [ ] Integration with project management tools

---

Built with ❤️ for Supagigs
