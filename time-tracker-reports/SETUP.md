# Time Tracker Reports - Setup Guide

This guide will help you set up and run the Next.js reports dashboard.

## Prerequisites

Before you begin, ensure you have the following installed:

1. **Node.js** (version 18 or higher)
   - Download from: https://nodejs.org/
   - Verify installation: `node --version`
   - Verify npm: `npm --version`

2. **Supabase Account** (for database access)
   - Sign up at: https://supabase.com/
   - You'll need your Supabase project URL and API keys

## Step-by-Step Setup

### Step 1: Navigate to the Project Directory

Open your terminal/command prompt and navigate to the project directory:

```bash
cd "d:\Megha\Electron App\time-tracker-new\time-tracker-reports"
```

### Step 2: Install Dependencies

Install all required npm packages:

```bash
npm install
```

This will install:
- Next.js and React
- Supabase client
- Chart.js for data visualization
- Tailwind CSS utilities
- Other dependencies listed in `package.json`

**Expected output:** You should see a message like "added X packages" with no vulnerabilities.

### Step 2.5: Install Tailwind CSS v4 (Optional)

If you encounter CSS-related errors, you may need to install Tailwind CSS v4:

```bash
npm install tailwindcss@next
```

This is required for the CSS imports in `globals.css` to work properly. Note: Next.js 16 may include Tailwind CSS support, but if you see errors about missing Tailwind imports, install this package.

### Step 3: Set Up Environment Variables

Create a `.env.local` file in the `time-tracker-reports` directory (same level as `package.json`).

**Create the file:**
```bash
# On Windows PowerShell
New-Item .env.local

# Or manually create a file named .env.local
```

**Add the following environment variables:**

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

**Where to find these values:**
1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **API**
3. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon/public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** (keep this secret!) → `SUPABASE_SERVICE_ROLE_KEY`

**Example `.env.local` file:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

⚠️ **Important:** Never commit `.env.local` to git! It contains sensitive keys.

### Step 4: Run the Development Server

Start the Next.js development server:

```bash
npm run dev
```

**Expected output:**
```
  ▲ Next.js 16.0.1
  - Local:        http://localhost:3000
  - Environments: .env.local

 ✓ Ready in 2.3s
 ○ Compiling / ...
 ✓ Compiled / in 1.2s
```

### Step 5: Open the Website

Open your web browser and navigate to:

```
http://localhost:3000
```

You should see the Next.js application running.

### Step 6: Access the Reports Dashboard

To view reports for a specific user, navigate to:

```
http://localhost:3000/reports/[userEmail]
```

Replace `[userEmail]` with the actual email address of the user whose reports you want to view.

**Example:**
```
http://localhost:3000/reports/user@example.com
```

## Available Scripts

The project includes the following npm scripts:

- **`npm run dev`** - Start development server (default port: 3000)
- **`npm run build`** - Build the production version
- **`npm run start`** - Start production server (requires build first)
- **`npm run lint`** - Run ESLint to check code quality

## Project Structure

```
time-tracker-reports/
├── src/
│   ├── app/              # Next.js app directory
│   │   ├── globals.css   # Global styles with Tailwind CSS
│   │   ├── layout.tsx    # Root layout
│   │   ├── page.tsx      # Home page
│   │   └── reports/      # Reports pages
│   ├── components/        # React components
│   │   ├── SummaryCard.tsx
│   │   ├── ScreenshotGrid.tsx
│   │   ├── WeeklyActivityChart.tsx
│   │   └── ScreenshotSelector.tsx
│   └── lib/              # Utility functions
│       ├── utils.ts      # cn() helper for class names
│       ├── supabaseServer.ts
│       └── supabaseBrowser.ts
├── public/               # Static assets
├── components.json       # shadcn/ui configuration
├── tsconfig.json         # TypeScript configuration
├── package.json          # Dependencies and scripts
└── .env.local            # Environment variables (create this)
```

## Troubleshooting

### Issue: "Supabase URL or Service Role Key missing"

**Solution:** Make sure you've created `.env.local` with all required environment variables.

### Issue: Port 3000 is already in use

**Solution:** Run on a different port:
```bash
npm run dev -- -p 3001
```
Then access at `http://localhost:3001`

### Issue: Module not found errors

**Solution:** Delete `node_modules` and `package-lock.json`, then reinstall:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: TypeScript errors

**Solution:** Make sure TypeScript is installed:
```bash
npm install --save-dev typescript @types/node @types/react @types/react-dom
```

## Building for Production

When you're ready to deploy:

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Start production server:**
   ```bash
   npm run start
   ```

## Next Steps

- The dashboard will display:
  - Summary cards with total work hours, daily averages, breaks, and idle time
  - Weekly activity chart showing active vs idle hours
  - Screenshot gallery organized by session

- To customize the dashboard, edit components in `src/components/`
- To modify styles, edit `src/app/globals.css`

## Need Help?

- Check Next.js documentation: https://nextjs.org/docs
- Check Supabase documentation: https://supabase.com/docs
- Review the code comments in component files

