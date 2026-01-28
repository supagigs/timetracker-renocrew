# Storage Bucket DELETE Policy Setup

## Problem
Screenshots are not being deleted from the Supabase storage bucket because the bucket lacks a DELETE policy.

## Solution
You need to configure a DELETE policy for the `screenshots` storage bucket in your Supabase dashboard.

## Steps to Fix

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **Storage** in the left sidebar
3. Click on the `screenshots` bucket (or whatever bucket name you're using)
4. Go to the **Policies** tab
5. Click **New Policy**
6. Configure the policy with these settings:
   - **Policy name**: `Allow DELETE for screenshots` 
   - **Allowed operation**: Check **DELETE** only
   - **Target roles**: Leave as **"Defaults to all (public) roles if none selected"** 
   - **Policy definition**: Type **ONLY** the word `true` (no quotes, no markdown, no code blocks)
     
     ⚠️ **CRITICAL**: In the Policy definition field, type ONLY:
     ```
     true
     ```
     Do NOT include:
     - Markdown code block markers (```sql or ```)
     - Quotes around `true`
     - Any other text
     
     The field should contain literally just the 4 characters: `true`

7. Click **Review** and then **Save policy**

### Quick Reference for Highlighted Fields

Based on what you see in the UI:

| Field | Current Value | What to Do |
|-------|--------------|------------|
| **Policy name** | `Allow DELETE for screenshots` | ✅ **Keep as is** - This is correct |
| **Allowed operation** | DELETE (checked, highlighted) | ✅ **Keep as is** - DELETE is correctly selected |
| **Target roles** | "Defaults to all (public) roles..." (highlighted) | ✅ **Keep as is** - The default is correct, no need to change |
| **Policy definition** | `1 bucket_id = 'screenshots'` (highlighted) | ⚠️ **CHANGE THIS** - Replace with just `true` |

**The only change you need to make**: In the **Policy definition** field, delete `1 bucket_id = 'screenshots'` and type **ONLY** the word `true` (no markdown code blocks, no quotes, just the 4 characters: `true`).

⚠️ **Common Error**: If you see "syntax error at or near 'true'", you likely included markdown code block syntax (```sql or ```). The Policy definition field expects raw SQL, not markdown formatting.

### Option 2: Using SQL (if your Supabase version supports it)

Run this in your Supabase SQL editor:

```sql
-- Note: Storage bucket policies are typically managed through the dashboard
-- This SQL may not work in all Supabase versions
-- If it doesn't work, use Option 1 (Dashboard method)

-- Check if storage policies table exists and create policy
-- This is a placeholder - actual implementation depends on Supabase version
```

### Option 3: Using Supabase Management API

If you have access to the Management API, you can create the policy programmatically:

```javascript
// Example using Supabase Management API (requires admin access)
// This is for reference only - most users should use Option 1

const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Note: Storage policies are managed differently than RLS policies
// Check Supabase documentation for the latest API
```

## Verification

After setting up the policy:

1. Try deleting a screenshot manually through the app
2. Check the application logs for any storage deletion errors
3. Verify in Supabase Storage dashboard that files are actually deleted

## Important Notes

- **Storage policies are separate from RLS policies**: Even if you have SERVICE_ROLE_KEY, storage bucket operations require explicit storage policies
- **Bucket name**: Make sure the bucket name matches what's configured in your `.env` file (`SUPABASE_STORAGE_BUCKET` or defaults to `screenshots`)
- **Service Role Key**: The app should use `SUPABASE_SERVICE_ROLE_KEY` for storage operations to work properly

## Troubleshooting

### Error: "syntax error at or near 'true'"

**Cause**: You included markdown code block syntax in the Policy definition field.

**Solution**: 
1. Clear the Policy definition field completely
2. Type ONLY the word `true` (no backticks, no ```sql, no quotes)
3. The field should contain exactly 4 characters: `t-r-u-e`

### Other Issues

If screenshots still aren't being deleted after setting up the policy:

1. Check application logs for specific error messages
2. Verify the bucket name matches your configuration
3. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in your `.env` file
4. Check that the storage path extraction is working (see logs for "Extracted path from URL")
5. Verify the policy was saved correctly in the Supabase dashboard

