/**
 * lib/cache.js
 *
 * Upstash Redis caching layer.
 * Gracefully no-ops when UPSTASH_REDIS_REST_URL is not set,
 * so the app works locally without Redis configured.
 *
 * TTL defaults (seconds):
 *   SLUG_TTL   — 5 min  — redirect destination per slug
 *   STATS_TTL  — 2 min  — aggregated analytics stats
 *   LINKS_TTL  — 60 sec — full links list
 */

const USE_CACHE = !!(
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
);

export const TTL = {
  SLUG: 300,    // 5 min
  STATS: 120,   // 2 min
  LINKS: 60,    // 1 min
};

let _redis = null;
function getRedis() {
  if (!_redis) {
    const { Redis } = require('@upstash/redis');
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return _redis;
}

/**
 * Get a cached value. Returns null on miss or error.
 * Upstash auto-parses JSON, so the returned value is already an object.
 */
export async function cacheGet(key) {
  if (!USE_CACHE) return null;
  try {
    const val = await getRedis().get(key);
    return val ?? null;
  } catch (err) {
    console.error('[cache] get error:', err?.message);
    return null;
  }
}

/**
 * Set a value with a TTL (seconds). Value is serialised to JSON.
 */
export async function cacheSet(key, value, ttlSec = TTL.STATS) {
  if (!USE_CACHE) return;
  try {
    await getRedis().set(key, JSON.stringify(value), { ex: ttlSec });
  } catch (err) {
    console.error('[cache] set error:', err?.message);
  }
}

/**
 * Delete one or more keys.
 */
export async function cacheDel(...keys) {
  if (!USE_CACHE || !keys.length) return;
  try {
    await getRedis().del(...keys);
  } catch (err) {
    console.error('[cache] del error:', err?.message);
  }
}

/**
 * Delete all keys matching a prefix (uses KEYS scan — fine for small datasets).
 */
export async function cacheDelPattern(prefix) {
  if (!USE_CACHE) return;
  try {
    const r = getRedis();
    const keys = await r.keys(`${prefix}*`);
    if (keys.length) await r.del(...keys);
  } catch (err) {
    console.error('[cache] delPattern error:', err?.message);
  }
}

// ── Semantic cache key builders ───────────────────────────────────────────────

export const KEYS = {
  slug: (slug) => `ll:slug:${slug}`,
  links: () => 'll:links',
  stats: (slug, cat) => `ll:stats:${slug || '_'}:${cat || '_'}`,
  clicks: (slug) => `ll:clicks:${slug || '_'}`,
};
