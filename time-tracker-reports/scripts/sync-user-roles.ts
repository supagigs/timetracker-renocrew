/**
 * Script to sync user roles from Frappe to Supabase
 * 
 * This script:
 * 1. Fetches all users from Supabase
 * 2. For each user, gets their role_profile_name from Frappe User doctype
 * 3. Updates the role column in Supabase based on whether role_profile_name is "SuperAdmin"
 * 
 * Note: This uses role_profile_name (not roles list) - the correct way to check for Role Profile in Frappe
 * 
 * Usage:
 *   npx tsx scripts/sync-user-roles.ts
 * 
 * Or with ts-node:
 *   npx ts-node scripts/sync-user-roles.ts
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get directory path - works with ES modules (tsx)
let scriptDir: string;
try {
  // ES modules - tsx uses this
  scriptDir = dirname(fileURLToPath(import.meta.url));
} catch {
  // CommonJS fallback (if running with node directly)
  // @ts-ignore - __dirname is available in CommonJS
  scriptDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
}

// Load environment variables from .env.local
config({ path: resolve(scriptDir, '../.env.local') });

// Also try loading from .env as fallback
config({ path: resolve(scriptDir, '../.env') });

const FRAPPE_URL = process.env.FRAPPE_URL;
const FRAPPE_API_KEY = process.env.FRAPPE_API_KEY;
const FRAPPE_API_SECRET = process.env.FRAPPE_API_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!FRAPPE_URL || !FRAPPE_API_KEY || !FRAPPE_API_SECRET) {
  console.error('❌ Missing Frappe configuration. Please set FRAPPE_URL, FRAPPE_API_KEY, and FRAPPE_API_SECRET in .env.local');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// Create Frappe client
function createFrappeClient() {
  if (!FRAPPE_URL || !FRAPPE_API_KEY || !FRAPPE_API_SECRET) {
    throw new Error('Frappe configuration is missing');
  }
  const baseURL = FRAPPE_URL.replace(/\/$/, '');
  return axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `token ${FRAPPE_API_KEY}:${FRAPPE_API_SECRET}`,
    },
  });
}

// Create Supabase client with service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Get role_profile_name from Frappe for a specific user email
 * Uses role_profile_name field from User doctype (not roles list)
 */
async function getFrappeRoleProfileForEmail(userEmail: string): Promise<string | null> {
  try {
    if (!userEmail) {
      return null;
    }

    const frappe = createFrappeClient();
    
    // Try method endpoint first (if whitelisted method exists)
    try {
      const methodRes = await frappe.get('/api/method/get_user_role_profile_by_email', {
        params: {
          email: userEmail,
        },
      });

      if (methodRes?.data?.message) {
        return methodRes.data.message || null;
      }
    } catch (methodErr) {
      // Method endpoint not available, fallback to resource API
      console.warn(`  ⚠️  Method endpoint failed for ${userEmail}, trying resource API`);
    }

    // Query User doctype directly for role_profile_name
    const res = await frappe.get('/api/resource/User', {
      params: {
        fields: JSON.stringify(['name', 'role_profile_name']),
        filters: JSON.stringify([['name', '=', userEmail]]),
        limit_page_length: 1,
      },
    });

    const users = res?.data?.data || [];
    if (users.length > 0) {
      return users[0]?.role_profile_name || null;
    }
    
    return null;
  } catch (err: any) {
    console.error(`  ⚠️  Error getting role profile for ${userEmail}:`, err.message || err);
    return null;
  }
}

/**
 * Sync roles from Frappe to Supabase
 */
async function syncUserRoles() {
  console.log('🔄 Starting user role sync from Frappe to Supabase...\n');

  try {
    // Fetch all users from Supabase
    const { data: users, error: fetchError } = await supabase
      .from('users')
      .select('id, email, role')
      .order('email');

    if (fetchError) {
      console.error('❌ Error fetching users from Supabase:', fetchError);
      process.exit(1);
    }

    if (!users || users.length === 0) {
      console.log('ℹ️  No users found in Supabase.');
      return;
    }

    console.log(`📊 Found ${users.length} users in Supabase\n`);

    let updated = 0;
    let unchanged = 0;
    let errors = 0;

    // Process each user
    for (const user of users) {
      const email = user.email;
      const currentRole = user.role;

      try {
        console.log(`🔍 Processing: ${email} (current role: ${currentRole || 'null'})`);

        // Get role_profile_name from Frappe (not roles list)
        const roleProfile = await getFrappeRoleProfileForEmail(email);
        
        // Store role_profile_name directly from Frappe (not converted)
        const newRole = roleProfile || null;

        // Only update if role has changed
        if (currentRole === newRole) {
          console.log(`  ✓ Role unchanged (${newRole || 'null'})\n`);
          unchanged++;
          continue;
        }

        // Update role in Supabase - store role_profile_name directly
        const { error: updateError } = await supabase
          .from('users')
          .update({ role: newRole })
          .eq('id', user.id);

        if (updateError) {
          console.error(`  ❌ Error updating role: ${updateError.message}\n`);
          errors++;
        } else {
          console.log(`  ✅ Updated: ${currentRole || 'null'} → ${newRole || 'null'}\n`);
          updated++;
        }
      } catch (err: any) {
        console.error(`  ❌ Error processing ${email}:`, err.message || err);
        errors++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📈 Sync Summary:');
    console.log(`  ✅ Updated: ${updated}`);
    console.log(`  ✓ Unchanged: ${unchanged}`);
    console.log(`  ❌ Errors: ${errors}`);
    console.log(`  📊 Total: ${users.length}`);
    console.log('='.repeat(50));

    if (errors > 0) {
      console.log('\n⚠️  Some users had errors. Please review the output above.');
      process.exit(1);
    } else {
      console.log('\n✨ Role sync completed successfully!');
    }
  } catch (err: any) {
    console.error('❌ Fatal error during sync:', err);
    process.exit(1);
  }
}

// Run the sync
syncUserRoles().catch((err) => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
});

