// Quick script to check if environment variables are set correctly
// Run with: node check-env.js

require('dotenv').config({ path: '.env.local' });

const requiredVars = {
  'NEXT_PUBLIC_SUPABASE_URL': process.env.NEXT_PUBLIC_SUPABASE_URL,
  'NEXT_PUBLIC_SUPABASE_ANON_KEY': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY,
  'FRAPPE_URL': process.env.FRAPPE_URL,
  'FRAPPE_API_KEY': process.env.FRAPPE_API_KEY,
  'FRAPPE_API_SECRET': process.env.FRAPPE_API_SECRET,
};

console.log('\n🔍 Checking environment variables...\n');

let allGood = true;

for (const [key, value] of Object.entries(requiredVars)) {
  if (!value) {
    console.log(`❌ ${key}: MISSING`);
    allGood = false;
  } else {
    // Check format
    if (key.includes('SUPABASE_URL')) {
      const isValid = value.startsWith('http://') || value.startsWith('https://');
      console.log(`${isValid ? '✅' : '⚠️ '} ${key}: ${isValid ? 'OK' : 'INVALID FORMAT (must start with http:// or https://)'}`);
      if (!isValid) allGood = false;
    } else if (key.includes('SERVICE_ROLE_KEY') || key.includes('ANON_KEY')) {
      const isValid = value.startsWith('eyJ') && value.length > 100;
      console.log(`${isValid ? '✅' : '⚠️ '} ${key}: ${isValid ? 'OK' : 'INVALID FORMAT (should be a JWT token starting with "eyJ")'}`);
      if (!isValid) allGood = false;
    } else if (key.includes('FRAPPE_URL')) {
      const isValid = value.startsWith('http://') || value.startsWith('https://');
      console.log(`${isValid ? '✅' : '⚠️ '} ${key}: ${isValid ? 'OK' : 'INVALID FORMAT (must start with http:// or https://)'}`);
      if (!isValid) allGood = false;
    } else {
      console.log(`✅ ${key}: SET (${value.length} characters)`);
    }
  }
}

console.log('\n');

if (allGood) {
  console.log('✅ All environment variables are set correctly!');
} else {
  console.log('❌ Some environment variables are missing or invalid.');
  console.log('\n📝 Next steps:');
  console.log('1. Make sure .env.local exists in the time-tracker-reports directory');
  console.log('2. Verify all values are correct (no extra spaces or quotes)');
  console.log('3. Get Supabase keys from: https://app.supabase.com → Project Settings → API');
  console.log('4. Get Frappe API keys from: Frappe → User → Settings → API Access → Generate Keys');
  console.log('5. Restart your Next.js server after updating .env.local');
}

console.log('\n');





