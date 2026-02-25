/**
 * Backfill Company Data from Frappe
 * 
 * This script backfills missing company data in time_sessions and screenshots tables
 * by fetching company information from Frappe's Employee doctype.
 * 
 * Usage:
 *   node scripts/backfill-company-from-frappe.js
 * 
 * Requirements:
 *   - .env file with FRAPPE_URL, FRAPPE_API_KEY, FRAPPE_API_SECRET
 *   - .env file with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const FRAPPE_URL = process.env.FRAPPE_URL;
const FRAPPE_API_KEY = process.env.FRAPPE_API_KEY;
const FRAPPE_API_SECRET = process.env.FRAPPE_API_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!FRAPPE_URL || !FRAPPE_API_KEY || !FRAPPE_API_SECRET) {
  console.error('❌ Missing Frappe credentials in .env file');
  console.error('   Required: FRAPPE_URL, FRAPPE_API_KEY, FRAPPE_API_SECRET');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('   Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Get company from Frappe Employee doctype for a user email
 */
async function getCompanyFromFrappe(userEmail) {
  try {
    // Create Frappe client with API key auth
    const frappe = axios.create({
      baseURL: FRAPPE_URL,
      headers: {
        'Authorization': `token ${FRAPPE_API_KEY}:${FRAPPE_API_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

    // Query Employee doctype
    const response = await frappe.get('/api/resource/Employee', {
      params: {
        fields: JSON.stringify(['company']),
        filters: JSON.stringify([['user_id', '=', userEmail]]),
        limit_page_length: 1,
      },
    });

    const employees = response?.data?.data || [];
    if (employees.length > 0) {
      const company = employees[0]?.company || null;
      return company;
    }

    return null;
  } catch (error) {
    console.warn(`  ⚠️  Error fetching company for ${userEmail}:`, error.message);
    return null;
  }
}

/**
 * Backfill company for time_sessions table
 */
async function backfillTimeSessions() {
  console.log('\n📊 Backfilling company in time_sessions table...\n');

  // Get all unique user emails from time_sessions that have NULL company
  const { data: sessions, error } = await supabase
    .from('time_sessions')
    .select('user_email')
    .is('company', null)
    .not('user_email', 'is', null);

  if (error) {
    console.error('❌ Error fetching time_sessions:', error);
    return { updated: 0, failed: 0 };
  }

  if (!sessions || sessions.length === 0) {
    console.log('  ✓ No records need updating');
    return { updated: 0, failed: 0 };
  }

  // Get unique user emails
  const uniqueEmails = [...new Set(sessions.map(s => s.user_email))];
  console.log(`  Found ${uniqueEmails.length} unique users with missing company\n`);

  let updated = 0;
  let failed = 0;
  const emailToCompany = new Map();

  // Fetch company for each user
  for (const email of uniqueEmails) {
    console.log(`  Fetching company for ${email}...`);
    const company = await getCompanyFromFrappe(email);
    
    if (company) {
      emailToCompany.set(email, company);
      console.log(`    ✓ Company: ${company}`);
    } else {
      console.log(`    ⚠️  No company found in Frappe`);
      failed++;
    }
  }

  // Update records
  console.log('\n  Updating records...');
  for (const [email, company] of emailToCompany.entries()) {
    const { error: updateError } = await supabase
      .from('time_sessions')
      .update({ company })
      .is('company', null)
      .eq('user_email', email);

    if (updateError) {
      console.error(`    ❌ Error updating ${email}:`, updateError.message);
      failed++;
    } else {
      const { count } = await supabase
        .from('time_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_email', email)
        .eq('company', company);
      
      updated += count || 0;
      console.log(`    ✓ Updated ${count || 0} records for ${email}`);
    }
  }

  return { updated, failed };
}

/**
 * Backfill company for screenshots table
 */
async function backfillScreenshots() {
  console.log('\n📸 Backfilling company in screenshots table...\n');

  // Try legacy schema first (user_email)
  const { data: screenshotsByEmail, error: emailError } = await supabase
    .from('screenshots')
    .select('user_email')
    .is('company', null)
    .not('user_email', 'is', null);

  // Try new schema (user_id)
  const { data: screenshotsById, error: idError } = await supabase
    .from('screenshots')
    .select('user_id, users!inner(email)')
    .is('company', null)
    .not('user_id', 'is', null);

  const emailsFromEmail = (screenshotsByEmail || []).map(s => s.user_email);
  const emailsFromId = (screenshotsById || []).map(s => s.users?.email).filter(Boolean);
  const allEmails = [...new Set([...emailsFromEmail, ...emailsFromId])];

  if (allEmails.length === 0) {
    console.log('  ✓ No records need updating');
    return { updated: 0, failed: 0 };
  }

  console.log(`  Found ${allEmails.length} unique users with missing company\n`);

  let updated = 0;
  let failed = 0;
  const emailToCompany = new Map();

  // Fetch company for each user
  for (const email of allEmails) {
    if (emailToCompany.has(email)) continue; // Already fetched
    
    console.log(`  Fetching company for ${email}...`);
    const company = await getCompanyFromFrappe(email);
    
    if (company) {
      emailToCompany.set(email, company);
      console.log(`    ✓ Company: ${company}`);
    } else {
      console.log(`    ⚠️  No company found in Frappe`);
      failed++;
    }
  }

  // Update records by user_email (legacy schema)
  console.log('\n  Updating records (user_email schema)...');
  for (const [email, company] of emailToCompany.entries()) {
    const { error: updateError } = await supabase
      .from('screenshots')
      .update({ company })
      .is('company', null)
      .eq('user_email', email);

    if (updateError) {
      console.error(`    ❌ Error updating ${email}:`, updateError.message);
      failed++;
    } else {
      const { count } = await supabase
        .from('screenshots')
        .select('*', { count: 'exact', head: true })
        .eq('user_email', email)
        .eq('company', company);
      
      updated += count || 0;
      console.log(`    ✓ Updated ${count || 0} records for ${email}`);
    }
  }

  // Update records by user_id (new schema)
  console.log('\n  Updating records (user_id schema)...');
  for (const [email, company] of emailToCompany.entries()) {
    // Get user_id for this email
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (!user) continue;

    const { error: updateError } = await supabase
      .from('screenshots')
      .update({ company })
      .is('company', null)
      .eq('user_id', user.id);

    if (updateError) {
      console.error(`    ❌ Error updating user_id ${user.id}:`, updateError.message);
      failed++;
    } else {
      const { count } = await supabase
        .from('screenshots')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('company', company);
      
      updated += count || 0;
      console.log(`    ✓ Updated ${count || 0} records for user_id ${user.id}`);
    }
  }

  return { updated, failed };
}

/**
 * Main execution
 */
async function main() {
  console.log('🔄 Starting company backfill from Frappe...\n');
  console.log('=' .repeat(60));

  try {
    const timeSessionsResult = await backfillTimeSessions();
    const screenshotsResult = await backfillScreenshots();

    console.log('\n' + '='.repeat(60));
    console.log('📈 Summary:');
    console.log(`  time_sessions: ${timeSessionsResult.updated} updated, ${timeSessionsResult.failed} failed`);
    console.log(`  screenshots: ${screenshotsResult.updated} updated, ${screenshotsResult.failed} failed`);
    console.log('='.repeat(60));
    console.log('\n✅ Backfill complete!\n');
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

