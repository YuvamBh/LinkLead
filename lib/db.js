import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const LINKS_FILE = path.join(DATA_DIR, 'links.json');
const CLICKS_FILE = path.join(DATA_DIR, 'clicks.json');

// Makes sure the data directory and JSON files exist before we try to read them
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LINKS_FILE)) {
    fs.writeFileSync(LINKS_FILE, '[]', 'utf-8');
  }
  if (!fs.existsSync(CLICKS_FILE)) {
    fs.writeFileSync(CLICKS_FILE, '[]', 'utf-8');
  }
}

export function getLinks() {
  ensureDataDir();
  const raw = fs.readFileSync(LINKS_FILE, 'utf-8');
  return JSON.parse(raw);
}

export function getLinkBySlug(slug) {
  const links = getLinks();
  return links.find((l) => l.slug === slug) || null;
}

export function addLink({ slug, destination }) {
  const links = getLinks();
  if (links.find((l) => l.slug === slug)) {
    return { error: 'Slug already exists' };
  }
  const newLink = {
    slug,
    destination,
    createdAt: new Date().toISOString(),
  };
  links.push(newLink);
  fs.writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2), 'utf-8');
  return { link: newLink };
}

export function deleteLink(slug) {
  let links = getLinks();
  const before = links.length;
  links = links.filter((l) => l.slug !== slug);
  if (links.length === before) return { error: 'Not found' };
  fs.writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2), 'utf-8');
  return { success: true };
}

export function getClicks() {
  ensureDataDir();
  const raw = fs.readFileSync(CLICKS_FILE, 'utf-8');
  return JSON.parse(raw);
}

export function getClicksBySlug(slug) {
  return getClicks().filter((c) => c.slug === slug);
}

export function addClick(clickData) {
  const clicks = getClicks();
  clicks.push(clickData);
  fs.writeFileSync(CLICKS_FILE, JSON.stringify(clicks, null, 2), 'utf-8');
  return clickData;
}

// Aggregates all click data into stats that the dashboard can display.
// Pass a slug to filter down to a single link, or leave it empty for global stats.
export function getStats(slugFilter = null) {
  let clicks = slugFilter ? getClicksBySlug(slugFilter) : getClicks();
  const links = getLinks();

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

  // Fill in every day of the last 30 days so the chart doesn't have gaps
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
