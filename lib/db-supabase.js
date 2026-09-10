/**
 * lib/db-supabase.js
 *
 * Multi-tenant Supabase-backed database layer.
 * All admin functions enforce isolation via the current user's Supabase session.
 */

import { supabaseAdmin, createAuthClient } from './supabase.js';
import { cacheGet, cacheSet, cacheDel, cacheDelPattern, KEYS, TTL } from './cache.js';
import { classifyLink } from './classifier.js';
import { cookies } from 'next/headers';

// ── Auth Helpers ──────────────────────────────────────────────────────────────

/**
 * Gets the current authenticated user's ID from the Next.js cookies.
 * Throws an error if no user is logged in.
 */
async function getUserId() {
  const cookieStore = await cookies();
  const supabase = createAuthClient(cookieStore);
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized: No active session');
  }
  return session.user.id;
}

// ── Column mapping helpers ────────────────────────────────────────────────────

function rowToLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id, // NEW: Expose user ID
    slug: row.slug,
    destination: row.destination,
    label: row.label || null,
    category: row.category || 'Other',
    categoryConfidence: row.category_confidence ?? 1,
    tags: row.tags || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function rowToClick(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    timestamp: row.timestamp,
    ip: row.ip,
    device: row.device,
    os: row.os,
    osVersion: row.os_version,
    browser: row.browser,
    browserVersion: row.browser_version,
    deviceModel: row.device_model,
    deviceVendor: row.device_vendor,
    referrer: row.referrer,
    country: row.country,
    countryCode: row.country_code,
    region: row.region,
    city: row.city,
    postalCode: row.postal_code,
    street: row.street,
    streetAddress: row.street_address,
    neighbourhood: row.neighbourhood,
    fullAddress: row.full_address,
    lat: row.lat,
    lon: row.lon,
    timezone: row.timezone,
    isp: row.isp,
    org: row.org,
    screen: row.screen,
    language: row.language,
  };
}

function clickToRow(c) {
  return {
    id: c.id,
    slug: c.slug,
    timestamp: c.timestamp,
    ip: c.ip || null,
    device: c.device || null,
    os: c.os || null,
    os_version: c.osVersion || null,
    browser: c.browser || null,
    browser_version: c.browserVersion || null,
    device_model: c.deviceModel || null,
    device_vendor: c.deviceVendor || null,
    referrer: c.referrer || null,
    country: c.country || null,
    country_code: c.countryCode || null,
    region: c.region || null,
    city: c.city || null,
    postal_code: c.postalCode || null,
    street: c.street || null,
    street_address: c.streetAddress || null,
    neighbourhood: c.neighbourhood || null,
    full_address: c.fullAddress || null,
    lat: c.lat ?? null,
    lon: c.lon ?? null,
    timezone: c.timezone || null,
    isp: c.isp || null,
    org: c.org || null,
    screen: c.screen || null,
    language: c.language || null,
  };
}

// ── Cache Keys (Tenant Scoped) ────────────────────────────────────────────────

// Helper to scope cache keys by user_id so users don't see each other's cached data
const TKEYS = {
  links: (userId) => `ll:links:${userId}`,
  stats: (userId, slug, cat) => `ll:stats:${userId}:${slug || '_'}:${cat || '_'}`,
  clicks: (userId) => `ll:clicks:${userId}`,
};

// ── Links ─────────────────────────────────────────────────────────────────────

export async function getLinks() {
  const userId = await getUserId();
  const cached = await cacheGet(TKEYS.links(userId));
  if (cached) return Array.isArray(cached) ? cached : JSON.parse(cached);

  const { data, error } = await supabaseAdmin
    .from('links')
    .select('*')
    .eq('user_id', userId) // ENFORCE TENANT
    .order('created_at', { ascending: false });

  if (error) throw new Error('getLinks: ' + error.message);

  const links = (data || []).map(rowToLink);
  await cacheSet(TKEYS.links(userId), links, TTL.LINKS);
  return links;
}

/**
 * PUBLIC ROUTE: Used by the redirect proxy.
 * Anyone can click a link, so we do NOT enforce user_id here.
 */
export async function getLinkBySlug(slug) {
  const cached = await cacheGet(KEYS.slug(slug));
  if (cached) {
    return typeof cached === 'string' ? JSON.parse(cached) : cached;
  }

  const { data, error } = await supabaseAdmin
    .from('links')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error('getLinkBySlug: ' + error.message);

  const link = data ? rowToLink(data) : null;
  if (link) await cacheSet(KEYS.slug(slug), link, TTL.SLUG);
  return link;
}

export async function addLink({ slug, destination, category, label }) {
  const userId = await getUserId(); // Fails if not logged in
  const classification = classifyLink(destination);
  const resolvedCategory = category || classification.category;

  const row = {
    user_id: userId, // ENFORCE TENANT
    slug,
    destination,
    label: label || null,
    category: resolvedCategory,
    category_confidence: classification.confidence,
    tags: classification.tags || [],
  };

  const { data, error } = await supabaseAdmin
    .from('links')
    .insert(row)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return { error: 'Slug already exists' };
    return { error: error.message };
  }

  const link = rowToLink(data);

  // Invalidate caches
  await cacheDel(TKEYS.links(userId));
  await cacheDelPattern(`ll:stats:${userId}:`);

  return { link };
}

export async function deleteLink(slug) {
  const userId = await getUserId();
  
  const { error, count } = await supabaseAdmin
    .from('links')
    .delete({ count: 'exact' })
    .eq('slug', slug)
    .eq('user_id', userId); // ENFORCE TENANT

  if (error) return { error: error.message };
  if (count === 0) return { error: 'Not found or not authorized' };

  // Invalidate caches
  await cacheDel(TKEYS.links(userId), KEYS.slug(slug));
  await cacheDelPattern(`ll:stats:${userId}:`);
  await cacheDelPattern(`ll:clicks:${userId}:`);

  return { success: true };
}

export async function updateLink(slug, patch) {
  const userId = await getUserId();
  
  const dbPatch = {};
  if (patch.label !== undefined)       dbPatch.label = patch.label;
  if (patch.destination !== undefined) dbPatch.destination = patch.destination;
  if (patch.category !== undefined)    dbPatch.category = patch.category;
  if (patch.tags !== undefined)        dbPatch.tags = patch.tags;
  dbPatch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('links')
    .update(dbPatch)
    .eq('slug', slug)
    .eq('user_id', userId) // ENFORCE TENANT
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return { error: 'Not found or not authorized' };
    return { error: error.message };
  }

  const link = rowToLink(data);
  await cacheDel(TKEYS.links(userId), KEYS.slug(slug));
  await cacheDelPattern(`ll:stats:${userId}:`);

  return { link };
}

export async function getCategories() {
  const links = await getLinks(); // Already tenant-scoped
  const cats = new Set(links.map((l) => l.category || 'Other'));
  return Array.from(cats).sort();
}

// ── Clicks ────────────────────────────────────────────────────────────────────

export async function getClicks() {
  const userId = await getUserId();
  const cached = await cacheGet(TKEYS.clicks(userId));
  if (cached) return Array.isArray(cached) ? cached : JSON.parse(cached);

  // Join with links to ensure we only get clicks for this user's links
  const { data, error } = await supabaseAdmin
    .from('clicks')
    .select(`
      *,
      links!inner (
        user_id
      )
    `)
    .eq('links.user_id', userId) // ENFORCE TENANT
    .order('timestamp', { ascending: false });

  if (error) throw new Error('getClicks: ' + error.message);

  const clicks = (data || []).map(rowToClick);
  await cacheSet(TKEYS.clicks(userId), clicks, TTL.STATS);
  return clicks;
}

export async function getClicksBySlug(slug) {
  const userId = await getUserId();
  
  const { data, error } = await supabaseAdmin
    .from('clicks')
    .select(`
      *,
      links!inner (
        user_id
      )
    `)
    .eq('slug', slug)
    .eq('links.user_id', userId) // ENFORCE TENANT
    .order('timestamp', { ascending: false });

  if (error) throw new Error('getClicksBySlug: ' + error.message);
  return (data || []).map(rowToClick);
}

/**
 * PUBLIC ROUTE: Used by the redirect proxy.
 * Anyone can click a link, so we do NOT enforce user_id here.
 */
export async function addClick(clickData) {
  const row = clickToRow(clickData);

  const { error } = await supabaseAdmin.from('clicks').insert(row);
  if (error) console.error('addClick error:', error.message);

  // Because this is a public route, we don't know the userId easily without a DB lookup.
  // The simplest cache invalidation strategy here is to flush ALL stats caches for the slug,
  // or we can let the short 2-minute TTL handle stats refresh automatically.
  // We'll let the 2-minute TTL handle it to keep the redirect route blazing fast.
  
  return clickData;
}

// ── Stats aggregation ─────────────────────────────────────────────────────────

export async function getStats(slugFilter = null, categoryFilter = null) {
  const userId = await getUserId();
  const cacheKey = TKEYS.stats(userId, slugFilter, categoryFilter);
  
  const cached = await cacheGet(cacheKey);
  if (cached) return typeof cached === 'string' ? JSON.parse(cached) : cached;

  const [allClicks, allLinks] = await Promise.all([
    getClicks(), // Tenant scoped
    getLinks(),  // Tenant scoped
  ]);

  // Determine which slugs are in scope
  let scopedLinks = allLinks;
  if (categoryFilter) {
    scopedLinks = allLinks.filter((l) => (l.category || 'Other') === categoryFilter);
  }
  const scopedSlugs = new Set(scopedLinks.map((l) => l.slug));

  const links = scopedLinks;
  const clicks = slugFilter
    ? allClicks.filter((c) => c.slug === slugFilter)
    : categoryFilter
    ? allClicks.filter((c) => scopedSlugs.has(c.slug))
    : allClicks;

  const totalClicks = clicks.length;
  const totalLinks = links.length;

  const devices = { Mobile: 0, Desktop: 0, Tablet: 0, Unknown: 0 };
  const browsers = {};
  const operatingSystems = {};
  const countries = {};
  const cities = {};
  const referrers = {};
  const clicksPerLink = {};
  const dailyClicks = {};
  const geoPoints = [];

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  clicks.forEach((click) => {
    const device = click.device || 'Unknown';
    devices[device] = (devices[device] || 0) + 1;

    const browser = click.browser || 'Unknown';
    browsers[browser] = (browsers[browser] || 0) + 1;

    const os = click.os || 'Unknown';
    operatingSystems[os] = (operatingSystems[os] || 0) + 1;

    const country = click.country || 'Unknown';
    countries[country] = (countries[country] || 0) + 1;

    const cityKey =
      click.city && click.city !== 'Unknown'
        ? `${click.city}, ${click.country}`
        : click.country !== 'Unknown'
        ? click.country
        : 'Unknown';
    cities[cityKey] = (cities[cityKey] || 0) + 1;

    const referrer = click.referrer || 'Direct';
    referrers[referrer] = (referrers[referrer] || 0) + 1;

    clicksPerLink[click.slug] = (clicksPerLink[click.slug] || 0) + 1;

    const clickDate = new Date(click.timestamp);
    if (clickDate >= thirtyDaysAgo) {
      const dayKey = clickDate.toISOString().split('T')[0];
      dailyClicks[dayKey] = (dailyClicks[dayKey] || 0) + 1;
    }

    if (click.lat != null && click.lon != null) {
      geoPoints.push({
        lat: click.lat,
        lon: click.lon,
        city: click.city,
        country: click.country,
        slug: click.slug,
      });
    }
  });

  const sortObj = (obj, limit = 10) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));

  const topLinks = Object.entries(clicksPerLink)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([slug, count]) => {
      const link = links.find((l) => l.slug === slug);
      return { slug, count, destination: link?.destination || 'N/A' };
    });

  // Fill in every day of the last 30 days so the chart has no gaps
  const chartLabels = [];
  const chartData = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split('T')[0];
    chartLabels.push(key);
    chartData.push(dailyClicks[key] || 0);
  }

  const result = {
    totalClicks,
    totalLinks,
    devices,
    browsers: sortObj(browsers),
    operatingSystems: sortObj(operatingSystems),
    countries: sortObj(countries),
    cities: sortObj(cities, 8),
    referrers: sortObj(referrers),
    topLinks,
    geoPoints,
    chart: { labels: chartLabels, data: chartData },
    recentClicks: clicks.slice(0, 50),
  };

  await cacheSet(cacheKey, result, TTL.STATS);
  return result;
}
