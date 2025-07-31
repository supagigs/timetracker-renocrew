# Supatimetracker ⏱️

A beautiful and efficient time tracking desktop application built with Electron and Supabase.

## Features

- 🎯 **Simple Time Tracking**: Start and stop timer with task names
- ⏱️ **Real-time Timer Display**: See elapsed time as you work
- 💾 **Cloud Storage**: All time logs are saved to Supabase
- 📊 **Recent Logs**: View your recent time tracking sessions
- 🎨 **Modern UI**: Beautiful gradient design with smooth animations
- 🔒 **Secure**: Environment variable support for credentials

## Prerequisites

- Node.js (version 14 or higher)
- npm or yarn
- Supabase account and project

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/supagigs/Supatimetracker.git
   cd Supatimetracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Supabase** (Optional - for production)
   
   Create a `.env` file in the root directory:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

   If you don't set environment variables, the app will use the default credentials.

4. **Set up Supabase Database**
   
   Create a table called `time_logs` in your Supabase database with the following structure:
   ```sql
   CREATE TABLE time_logs (
     id SERIAL PRIMARY KEY,
     task_name TEXT NOT NULL,
     start_time TIMESTAMP WITH TIME ZONE NOT NULL,
     end_time TIMESTAMP WITH TIME ZONE NOT NULL,
     duration_seconds INTEGER,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );
   ```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### How to Use

1. **Enter a task name** in the input field
2. **Click "Start"** to begin tracking time
3. **Work on your task** - the timer will show elapsed time
4. **Click "Stop"** when you're done
5. **View recent logs** at the bottom of the app

## Project Structure

```
Supatimetracker/
├── main.js          # Electron main process
├── renderer.js      # Renderer process (UI logic)
├── index.html       # Main UI
├── package.json     # Dependencies and scripts
└── README.md        # This file
```

## Database Schema

The app uses a simple `time_logs` table:

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| task_name | TEXT | Name of the task |
| start_time | TIMESTAMP | When timer started |
| end_time | TIMESTAMP | When timer stopped |
| duration_seconds | INTEGER | Duration in seconds |
| created_at | TIMESTAMP | Record creation time |

CREATE TABLE time_logs (
  id SERIAL PRIMARY KEY,
  task_name TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

## Environment Variables

For production use, set these environment variables:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Your Supabase anonymous key

## Troubleshooting

### Common Issues

1. **App won't start**
   - Make sure you have Node.js installed
   - Run `npm install` to install dependencies
   - Check that Electron is properly installed

2. **Can't connect to Supabase**
   - Verify your Supabase credentials
   - Check your internet connection
   - Ensure the `time_logs` table exists in your database

3. **Timer not working**
   - Make sure you enter a task name before starting
   - Check the browser console for errors (Ctrl+Shift+I)

### Development Tips

- Use `NODE_ENV=development npm start` to open DevTools automatically
- Check the console for detailed error messages
- The app logs all operations to the console

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

If you encounter any issues, please:
1. Check the troubleshooting section above
2. Search existing issues on GitHub
3. Create a new issue with detailed information

---

Built with ❤️ for Supagigs 