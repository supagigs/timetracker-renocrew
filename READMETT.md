# Time Tracker - Simplified Productivity App

A clean, modern time tracking application built with Electron and Supabase. Track your work time, breaks, and productivity with automatic screenshot capture.

## Features ✨

- **Simple Login**: Email-based authentication
- **Time Tracking**: Start/stop work sessions with break management
- **Activity Monitoring**: Automatic screenshot capture during active work
- **Visual Reports**: Pie charts and bar graphs showing your productivity
- **Daily Statistics**: Track total time, breaks taken, and session duration
- **Weekly Reports**: View your productivity trends over the last 7 days

## Application Flow 🔄

1. **Login Page**: Enter your email to sign in or create a new account
2. **Display Name** (New Users Only): Set your display name for personalization
3. **Home Page**: Welcome screen with Clock In and Reports buttons
4. **Time Tracker**: Active session management with timer controls
5. **Reports Page**: View weekly productivity charts and statistics

## Database Schema 📊

The application uses three main tables:

- **users**: Store user email and display name
- **time_sessions**: Track work sessions with start/end times and durations
- **screenshots**: Store base64-encoded screenshots captured during active work

## Setup Instructions 🚀

### 1. Database Setup

Run the SQL commands in `database-schema.sql` in your Supabase SQL editor:

```sql
-- This will create the necessary tables and RLS policies
-- See database-schema.sql for complete setup
```

### 2. Environment Variables

Create a `.env` file in the root directory:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run the Application

```bash
npm start
```

## Usage Guide 📱

### Starting a Work Session

1. Login with your email
2. Click "Clock In" on the home page
3. Click "Start" to begin tracking time
4. Use "Take Break" to pause tracking
5. Click "Clock Out" to end your session

### Viewing Reports

1. Click "View Reports" from any page
2. See your last 7 days of productivity
3. View total hours, average daily hours, and most productive day

### Screenshot Capture

- Screenshots are automatically captured every 30 seconds during active work
- Screenshots are paused during breaks
- All screenshots are stored securely in the database

## Technical Details 🔧

### Frontend
- **Electron**: Desktop application framework
- **HTML/CSS/JavaScript**: Modern, responsive UI
- **Chart.js**: For data visualization

### Backend
- **Supabase**: Database and authentication
- **PostgreSQL**: Data storage with RLS policies

### Security
- Row Level Security (RLS) enabled on all tables
- User data isolation
- Secure screenshot storage

## File Structure 📁

```
time-tracker-new/
├── main.js                 # Electron main process
├── preload.js             # Secure API bridge
├── database-schema.sql    # Database setup
├── renderer/
│   ├── screens/           # HTML pages
│   │   ├── login.html
│   │   ├── displayName.html
│   │   ├── home.html
│   │   ├── tracker.html
│   │   └── report.html
│   ├── scripts/           # JavaScript files
│   │   ├── login.js
│   │   ├── displayName.js
│   │   ├── home.js
│   │   ├── tracker.js
│   │   ├── report.js
│   │   ├── supabaseClient.js
│   │   └── utils.js
│   └── styles/
│       └── common.css     # Styling
└── package.json
```

## Troubleshooting 🔍

### Common Issues

1. **Database Connection Error**: Check your Supabase URL and API key
2. **Screenshot Capture Not Working**: Ensure proper permissions are granted
3. **Charts Not Displaying**: Check if Chart.js is loading correctly

### Debug Mode

Open Developer Tools (F12) to view console logs and debug information.

## Contributing 🤝

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License 📄

This project is licensed under the MIT License - see the LICENSE file for details.

## Support 💬

For support or questions, please open an issue on GitHub.