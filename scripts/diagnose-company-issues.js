/**
 * Diagnose Company Data Issues
 * 
 * This script helps identify issues with company data in the database:
 * - Users with NULL company
 * - Case sensitivity mismatches
 * - Whitespace issues
 * 
 * Usage:
 *   node scripts/diagnose-company-issues.js
 * 
 * Requirements:
 *   - .env file with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('   Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function diagnoseCompanyIssues() {
  console.log('🔍 Diagnosing company data issues...\n');
  console.log('='.repeat(60));

  try {
    // 1. Check users table
    console.log('\n📊 USERS TABLE:');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('email, company, role');

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }

    if (!users || users.length === 0) {
      console.log('  ⚠️  No users found');
      return;
    }

    const usersWithNullCompany = users.filter(u => !u.company);
    const usersWithCompany = users.filter(u => u.company);
    const uniqueCompanies = [...new Set(usersWithCompany.map(u => u.company?.trim()))].filter(Boolean);
    
    console.log(`  Total users: ${users.length}`);
    console.log(`  Users with company: ${usersWithCompany.length}`);
    console.log(`  Users with NULL company: ${usersWithNullCompany.length}`);
    console.log(`  Unique companies: ${uniqueCompanies.length}`);
    
    if (usersWithNullCompany.length > 0) {
      console.log('\n  ⚠️  Users with NULL company:');
      usersWithNullCompany.slice(0, 10).forEach(user => {
        console.log(`    - ${user.email} (role: ${user.role || 'null'})`);
      });
      if (usersWithNullCompany.length > 10) {
        console.log(`    ... and ${usersWithNullCompany.length - 10} more`);
      }
    }

    // Check for case sensitivity issues
    const companyGroups = new Map();
    usersWithCompany.forEach(user => {
      const normalized = user.company?.trim().toLowerCase();
      if (!normalized) return;
      
      if (!companyGroups.has(normalized)) {
        companyGroups.set(normalized, []);
      }
      companyGroups.get(normalized).push(user.company);
    });

    const caseIssues = [];
    companyGroups.forEach((variants, normalized) => {
      const uniqueVariants = [...new Set(variants)];
      if (uniqueVariants.length > 1) {
        caseIssues.push({ normalized, variants: uniqueVariants });
      }
    });

    if (caseIssues.length > 0) {
      console.log('\n  ⚠️  Case sensitivity issues found:');
      caseIssues.slice(0, 5).forEach(issue => {
        console.log(`    - "${issue.normalized}":`);
        issue.variants.forEach(variant => {
          console.log(`      • "${variant}"`);
        });
      });
      if (caseIssues.length > 5) {
        console.log(`    ... and ${caseIssues.length - 5} more`);
      }
    } else {
      console.log('\n  ✓ No case sensitivity issues found');
    }

    // 2. Check time_sessions table
    console.log('\n📊 TIME_SESSIONS TABLE:');
    const { data: sessions, error: sessionsError } = await supabase
      .from('time_sessions')
      .select('user_email, company')
      .limit(1000);

    if (sessionsError) {
      console.error('  ❌ Error fetching time_sessions:', sessionsError);
    } else if (sessions) {
      const sessionsWithNullCompany = sessions.filter(s => !s.company);
      const sessionsWithCompany = sessions.filter(s => s.company);
      console.log(`  Sample size: ${sessions.length} records`);
      console.log(`  Sessions with company: ${sessionsWithCompany.length}`);
      console.log(`  Sessions with NULL company: ${sessionsWithNullCompany.length}`);
      
      if (sessionsWithNullCompany.length > 0) {
        const uniqueEmails = [...new Set(sessionsWithNullCompany.map(s => s.user_email))];
        console.log(`  Users with NULL company in sessions: ${uniqueEmails.length}`);
      }
    }

    // 3. Check screenshots table
    console.log('\n📊 SCREENSHOTS TABLE:');
    const { data: screenshots, error: screenshotsError } = await supabase
      .from('screenshots')
      .select('user_email, company')
      .limit(1000);

    if (screenshotsError) {
      console.error('  ❌ Error fetching screenshots:', screenshotsError);
    } else if (screenshots) {
      const screenshotsWithNullCompany = screenshots.filter(s => !s.company);
      const screenshotsWithCompany = screenshots.filter(s => s.company);
      console.log(`  Sample size: ${screenshots.length} records`);
      console.log(`  Screenshots with company: ${screenshotsWithCompany.length}`);
      console.log(`  Screenshots with NULL company: ${screenshotsWithNullCompany.length}`);
      
      if (screenshotsWithNullCompany.length > 0) {
        const uniqueEmails = [...new Set(screenshotsWithNullCompany.map(s => s.user_email))];
        console.log(`  Users with NULL company in screenshots: ${uniqueEmails.length}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Diagnosis complete!\n');
    
    if (usersWithNullCompany.length > 0) {
      console.log('💡 Recommendation: Run the backfill script to populate missing company data:');
      console.log('   node scripts/backfill-company-from-frappe.js\n');
    }
    
    if (caseIssues.length > 0) {
      console.log('💡 Recommendation: Run the normalization migration:');
      console.log('   database-migration-fix-company-comparisons.sql\n');
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

diagnoseCompanyIssues();

