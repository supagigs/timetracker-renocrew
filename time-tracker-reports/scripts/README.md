# User Role Sync Script

This script syncs user roles from Frappe to Supabase by checking each user's roles in Frappe and updating the `role` column in the Supabase `users` table.

## How It Works

1. Fetches all users from Supabase
2. For each user, queries Frappe to get their role_profile_name from User doctype
3. If the user's role_profile_name is "SuperAdmin" in Frappe, sets their role to `'Client'` in Supabase
4. Otherwise, sets their role to `'Freelancer'` in Supabase
5. Only updates users whose role has changed

## Prerequisites

1. Make sure you have the required environment variables set in `.env.local`:
   - `FRAPPE_URL` - Your Frappe instance URL
   - `FRAPPE_API_KEY` - Frappe API key
   - `FRAPPE_API_SECRET` - Frappe API secret
   - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
   - `NEXT_SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for admin access)

2. Install dependencies (if not already installed):
   ```bash
   npm install
   ```

## Usage

Run the sync script:

```bash
npm run sync-roles
```

Or directly with tsx:

```bash
npx tsx scripts/sync-user-roles.ts
```

## Output

The script will:
- Show progress for each user being processed
- Display which users were updated and what their new role is
- Show a summary at the end with:
  - Number of users updated
  - Number of users unchanged
  - Number of errors (if any)

## Example Output

```
🔄 Starting user role sync from Frappe to Supabase...

📊 Found 10 users in Supabase

🔍 Processing: user1@example.com (current role: null)
  ✅ Updated: null → Client (role_profile: SuperAdmin)

🔍 Processing: user2@example.com (current role: Freelancer)
  ✓ Role unchanged (Freelancer)

...

==================================================
📈 Sync Summary:
  ✅ Updated: 3
  ✓ Unchanged: 7
  ❌ Errors: 0
  📊 Total: 10
==================================================

✨ Role sync completed successfully!
```

## Notes

- The script uses the Supabase service role key, so it has admin access to update any user
- Users are processed sequentially to avoid rate limiting
- If a user doesn't exist in Frappe or has no role_profile_name, they will be set to `'Freelancer'`
- The script only updates users whose role actually changed to minimize database writes

