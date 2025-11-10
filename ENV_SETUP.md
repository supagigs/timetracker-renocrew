# Environment Configuration Guide

Both the Electron desktop app and the Next.js reports portal rely on Supabase. This guide explains which environment variables you need, where to place them, and how to troubleshoot common issues.

---

## 1. Required Variables (Electron App)

Create a `.env` file in the project root (same folder as `package.json`). The build process bundles this file into the packaged app.

```env
# Supabase project credentials
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<public-anon-key>

# Optional but recommended – used by the main process for server-side inserts
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Storage bucket for screenshots (defaults to "screenshots" if omitted)
SUPABASE_STORAGE_BUCKET=screenshots

# Reports portal URL (used when the desktop app opens "View Reports")
REPORTS_URL=http://localhost:3000/reports
```

### Notes
- The **service role key** lets the app upload screenshots directly to Supabase Storage and insert metadata even when Row Level Security is strict. If you omit it, the app falls back to the anon key; uploads may fail unless policies allow anon access.
- Keep the `.env` file out of version control. It is already listed in `.gitignore`.
- After editing `.env`, restart the Electron app. When packaged, rebuild with `npm run build` so the updated file is included.

---

## 2. Required Variables (Reports Portal)

Inside `time-tracker-reports`, create `.env.local` (Next.js automatically loads this file). Prefix values with `NEXT_PUBLIC_` so they are available on the client.

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<public-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # used by server components only
SESSION_STORAGE_BUCKET=screenshots             # keep in sync with the desktop app
```

If your reports portal runs on a different domain than the desktop app expects, update the `REPORTS_URL` in the desktop `.env` to match the deployed URL (for example `https://reports.yourdomain.com/reports`).

---

## 3. Obtaining Supabase Credentials

1. Open your project at [https://app.supabase.com](https://app.supabase.com).
2. Navigate to **Project Settings → API**.
3. Copy the **Project URL** → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`.
4. Copy the **anon/public key** → `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Copy the **service role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret).

> Never expose the service role key in client-side code or public repositories. `.env` and `.env.local` should remain private.

---

## 4. Verifying Your Setup

- Launch the Electron app. If Supabase variables are missing you will see a red banner labelled “Configuration Error”.
- Run the reports portal (`cd time-tracker-reports && npm run dev`). If the dashboard cannot connect, the browser console will log Supabase initialization errors.
- Check that `SUPABASE_STORAGE_BUCKET` exists in Supabase Storage. Create it manually the first time (recommended bucket name: `screenshots`).

---

## 5. Troubleshooting

### Banner Still Shows “Missing Supabase environment variables”
- Ensure `.env` is in the project root (alongside `package.json`).
- File names must be exact: `.env`, not `env.txt`.
- Rebuild packaged apps. Development mode (`npm run dev`) picks up changes immediately, but installed builds need to be rebuilt.

### Screenshot Uploads Fail
- Supply `SUPABASE_SERVICE_ROLE_KEY`.
- Confirm the bucket name in Supabase matches `SUPABASE_STORAGE_BUCKET`.
- Check Supabase Storage RLS policies—service role bypasses RLS, but anon keys require explicit permissions.

### Reports Portal Cannot Fetch Data
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.
- Ensure the Supabase policies allow the authenticated role to select rows.
- If you changed `REPORTS_URL`, restart the Electron app so it launches the correct address.

### “supabase.from is not a function”
- Typically indicates the Supabase client failed to initialize because environment variables were missing or mistyped. Double-check the `.env` files and restart.

---

## 6. Helpful Commands

```bash
# Restart the Electron app in dev mode
npm run dev

# Rebuild the packaged installer after changing .env
npm run build

# Start the reports portal locally
cd time-tracker-reports
npm run dev
```

Keep the environment files up to date whenever you rotate keys or deploy to a new Supabase project. Consistent configuration ensures logout sync, session tracking, and screenshot uploads all function as expected. ✅







