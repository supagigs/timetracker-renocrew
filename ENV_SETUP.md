# Environment Variables Setup Guide

## Problem

If you're seeing these errors:
- `Supabase environment variables not found`
- `SUPABASE_URL: Missing`
- `SUPABASE_ANON_KEY: Missing`
- `supabase.from is not a function`

This means your `.env` file is missing or not configured correctly.

## Solution

### Step 1: Create a `.env` file

Create a file named `.env` in the root directory of your project (same folder as `package.json`).

### Step 2: Add your Supabase credentials

Open the `.env` file and add the following:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 3: Get your Supabase credentials

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project (or create a new one)
3. Go to **Settings** → **API**
4. Copy the following:
   - **Project URL** → This is your `SUPABASE_URL`
   - **anon/public key** → This is your `SUPABASE_ANON_KEY`

### Step 4: Example `.env` file

```env
# Supabase Configuration
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxNjIzOTAyMiwiZXhwIjoxOTMxODE1MDIyfQ.example

# Optional: Reports URL (if you have a reports dashboard)
REPORTS_URL=http://localhost:3000/reports
```

### Step 5: Restart the application

After creating/updating the `.env` file:

1. **Close the Electron app completely** (if it's running)
2. **Restart the app**:
   ```bash
   npm start
   ```
   or
   ```bash
   npm run dev
   ```

## Important Notes

- ⚠️ **Never commit the `.env` file to Git** - it contains sensitive credentials
- ✅ The `.env` file should be in the root directory (same folder as `package.json`)
- ✅ Make sure there are no spaces around the `=` sign
- ✅ Don't use quotes around the values (unless the value itself contains spaces)

## Troubleshooting

### Still seeing "Missing" errors?

1. **Check file location**: Make sure `.env` is in the root directory
2. **Check file name**: It should be exactly `.env` (not `.env.txt` or `env`)
3. **Restart the app**: Close and reopen the Electron app
4. **Check for typos**: Make sure variable names are exactly `SUPABASE_URL` and `SUPABASE_ANON_KEY`

### "supabase.from is not a function" error?

This error occurs when:
- The `.env` file is missing (most common)
- The Supabase client failed to initialize
- The browser is using cached JavaScript files

**Solution**:
1. Create/update the `.env` file (see above)
2. **Hard refresh the browser** (Ctrl+Shift+R or Cmd+Shift+R)
3. **Clear browser cache** if needed
4. Restart the Electron app

### Still not working?

1. Verify your Supabase project is active
2. Check that your credentials are correct
3. Make sure you're using the **anon/public key**, not the service role key
4. Check the console for more detailed error messages

## Need Help?

If you're still having issues:
1. Check the main README.md for database setup instructions
2. Verify your Supabase project is set up correctly
3. Make sure all database migrations have been run







