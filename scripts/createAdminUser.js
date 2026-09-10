/**
 * scripts/createAdminUser.js
 *
 * Programmatically creates a Supabase Auth user (e.g. your master account).
 * 
 * Usage:
 *   node scripts/createAdminUser.js yuvambh@gmail.com MySecurePassword123!
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: node scripts/createAdminUser.js <email> <password>');
    process.exit(1);
  }

  console.log(`Creating user: ${email}...`);

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-verify
  });

  if (error) {
    console.error('❌ Error creating user:', error.message);
    process.exit(1);
  }

  console.log('✅ User created successfully!');
  console.log('User ID:', data.user.id);
  console.log('Email:', data.user.email);
}

main().catch(console.error);
