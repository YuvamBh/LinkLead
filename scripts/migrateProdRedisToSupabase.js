/**
 * scripts/migrateProdRedisToSupabase.js
 *
 * Migration script to securely pull production data from Upstash Redis 
 * and upload it to Supabase, permanently tying it to a specified user's email.
 *
 * Usage:
 *   node scripts/migrateProdRedisToSupabase.js yuvambh@gmail.com
 */

const { Redis } = require('@upstash/redis');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.error('❌ Missing Upstash Redis credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const redis = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });

async function migrate() {
  const targetEmail = process.argv[2];
  if (!targetEmail) {
    console.error('Usage: node scripts/migrateProdRedisToSupabase.js <email>');
    process.exit(1);
  }

  console.log(`Looking up user ID for ${targetEmail}...`);
  // Note: auth.admin.listUsers could be paginated if there were many, 
  // but since we are just migrating we can fetch the list or query directly.
  // Actually, Supabase admin API doesn't have a direct `getUserByEmail`, 
  // we can use listUsers or just a raw SQL RPC if needed. 
  // Let's iterate through listUsers (fine for small number of users).
  
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error('❌ Failed to fetch users:', authError.message);
    process.exit(1);
  }

  const targetUser = users.find(u => u.email === targetEmail);
  if (!targetUser) {
    console.error(`❌ User ${targetEmail} not found in Supabase Auth. Create them first with createAdminUser.js!`);
    process.exit(1);
  }
  
  const userId = targetUser.id;
  console.log(`✅ Found user: ${userId}`);

  console.log('\n📡 Connecting to Upstash Redis...');
  
  const rawLinks = await redis.get('linklead:links');
  const links = Array.isArray(rawLinks) ? rawLinks : (rawLinks ? JSON.parse(rawLinks) : []);
  
  const rawClicks = await redis.get('linklead:clicks');
  const clicks = Array.isArray(rawClicks) ? rawClicks : (rawClicks ? JSON.parse(rawClicks) : []);

  console.log(`Found ${links.length} links and ${clicks.length} clicks in Redis.`);

  // 1. Migrate Links (Must go first because of Foreign Key constraints on slug)
  if (links.length > 0) {
    console.log('\n⬆️ Migrating links...');
    
    // Process one by one or in small batches
    for (const link of links) {
      const row = {
        user_id: userId, // TIE TO TENANT
        slug: link.slug,
        destination: link.destination,
        label: link.label || null,
        category: link.category || 'Other',
        category_confidence: typeof link.categoryConfidence === 'number' ? link.categoryConfidence : 1.0,
        tags: link.tags || [],
        created_at: link.createdAt || new Date().toISOString(),
        updated_at: link.updatedAt || new Date().toISOString()
      };

      const { error } = await supabase.from('links').upsert(row, { onConflict: 'slug' });
      if (error) {
        console.error(`❌ Error migrating link ${link.slug}:`, error.message);
      }
    }
    console.log(`✅ Migrated ${links.length} links.`);
  }

  // 2. Migrate Clicks
  if (clicks.length > 0) {
    console.log('\n⬆️ Migrating clicks...');
    
    // Insert in batches of 500 to avoid payload limits
    const batchSize = 500;
    for (let i = 0; i < clicks.length; i += batchSize) {
      const batch = clicks.slice(i, i + batchSize).map(click => ({
        id: click.id, 
        slug: click.slug,
        timestamp: click.timestamp,
        ip: click.ip || null,
        device: click.device || null,
        os: click.os || null,
        os_version: click.osVersion || null,
        browser: click.browser || null,
        browser_version: click.browserVersion || null,
        device_model: click.deviceModel || null,
        device_vendor: click.deviceVendor || null,
        referrer: click.referrer || null,
        country: click.country || null,
        country_code: click.countryCode || null,
        region: click.region || null,
        city: click.city || null,
        postal_code: click.postalCode || null,
        street: click.street || null,
        street_address: click.streetAddress || null,
        neighbourhood: click.neighbourhood || null,
        full_address: click.fullAddress || null,
        lat: click.lat ?? null,
        lon: click.lon ?? null,
        timezone: click.timezone || null,
        isp: click.isp || null,
        org: click.org || null,
        screen: click.screen || null,
        language: click.language || null
      }));

      const { error } = await supabase.from('clicks').upsert(batch, { onConflict: 'id' });
      if (error) {
        console.error(`❌ Error migrating click batch ${i}:`, error.message);
      } else {
        console.log(`   Migrated clicks ${i} to ${i + batch.length}`);
      }
    }
    console.log(`✅ Migrated ${clicks.length} clicks.`);
  }

  console.log('\n🎉 Multi-tenant Migration complete!');
}

migrate().catch(console.error);
