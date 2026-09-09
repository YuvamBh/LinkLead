import fs from 'fs';
import path from 'path';

// We use Redis (via Upstash) in production for persistent storage.
// Locally, we fall back to JSON files so you don't need any external service.
// On Vercel without Redis, we use /tmp which is writable (but resets on cold starts).
const USE_REDIS = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const LINKS_KEY = 'linklead:links';
const CLICKS_KEY = 'linklead:clicks';

// /tmp is always writable on Vercel even though the rest of the filesystem is not
const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR = IS_VERCEL
  ? '/tmp/linklead'
  : path.join(process.cwd(), 'data');
const LINKS_FILE = path.join(DATA_DIR, 'links.json');
const CLICKS_FILE = path.join(DATA_DIR, 'clicks.json');

function getRedisClient() {
  const { Redis } = require('@upstash/redis');
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LINKS_FILE)) fs.writeFileSync(LINKS_FILE, '[]', 'utf-8');
  if (!fs.existsSync(CLICKS_FILE)) fs.writeFileSync(CLICKS_FILE, '[]', 'utf-8');
}

// Generic read/write wrappers that switch between Redis and file depending on environment

async function readList(redisKey, filePath) {
  if (USE_REDIS) {
    const redis = getRedisClient();
    const data = await redis.get(redisKey);
    if (!data) return [];
    // Upstash auto-parses JSON, so data might already be an array
    return Array.isArray(data) ? data : JSON.parse(data);
  }
  ensureDataDir();
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

async function writeList(redisKey, filePath, list) {
  if (USE_REDIS) {
    const redis = getRedisClient();
    await redis.set(redisKey, JSON.stringify(list));
    return;
  }
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
}

// Sync wrappers for links (used in redirect route which needs to be fast).
// These work because links list stays small.
function readLinksSync() {
  if (USE_REDIS) {
    throw new Error('Use async version in Redis mode');
  }
  ensureDataDir();
  return JSON.parse(fs.readFileSync(LINKS_FILE, 'utf-8'));
}

// Public API - all async to support both storage backends

export async function getLinks() {
  return readList(LINKS_KEY, LINKS_FILE);
}

export async function getLinkBySlug(slug) {
  const links = await getLinks();
  return links.find((l) => l.slug === slug) || null;
}

export async function addLink({ slug, destination }) {
  const links = await getLinks();
  if (links.find((l) => l.slug === slug)) {
    return { error: 'Slug already exists' };
  }
  const newLink = { slug, destination, createdAt: new Date().toISOString() };
  links.push(newLink);
  await writeList(LINKS_KEY, LINKS_FILE, links);
  return { link: newLink };
}

export async function deleteLink(slug) {
  let links = await getLinks();
  const before = links.length;
  links = links.filter((l) => l.slug !== slug);
  if (links.length === before) return { error: 'Not found' };
  await writeList(LINKS_KEY, LINKS_FILE, links);
  return { success: true };
}

export async function getClicks() {
  return readList(CLICKS_KEY, CLICKS_FILE);
}

export async function getClicksBySlug(slug) {
  const clicks = await getClicks();
  return clicks.filter((c) => c.slug === slug);
}

export async function addClick(clickData) {
  const clicks = await getClicks();
  clicks.push(clickData);
  await writeList(CLICKS_KEY, CLICKS_FILE, clicks);
  return clickData;
}

// Aggregates all click data into stats for the dashboard.
// Pass a slug to filter to a single link, or leave empty for global stats.
export async function getStats(slugFilter = null) {
  const [allClicks, links] = await Promise.all([getClicks(), getLinks()]);
  let clicks = slugFilter ? allClicks.filter((c) => c.slug === slugFilter) : allClicks;

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

    const cityKey = click.city && click.city !== 'Unknown'
      ? `${click.city}, ${click.country}`
      : (click.country !== 'Unknown' ? click.country : 'Unknown');
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
      geoPoints.push({ lat: click.lat, lon: click.lon, city: click.city, country: click.country, slug: click.slug });
    }
  });

  const sortObj = (obj, limit = 10) =>
    Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }));

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

  return {
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
    recentClicks: clicks.slice(-50).reverse(),
  };
}
