import { NextResponse } from 'next/server';
import { getLinkBySlug, addClick } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { UAParser } from 'ua-parser-js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { slug } = await params;

  // Look up the link
  const link = getLinkBySlug(slug);
  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  // Parse user agent
  const userAgent = request.headers.get('user-agent') || '';
  const parser = new UAParser(userAgent);
  const ua = parser.getResult();

  // Determine device type
  let device = 'Desktop';
  if (ua.device.type === 'mobile') device = 'Mobile';
  else if (ua.device.type === 'tablet') device = 'Tablet';

  // Get IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded ? forwarded.split(',')[0].trim() : realIp || '127.0.0.1';

  // Get referrer
  const rawReferrer = request.headers.get('referer') || '';
  let referrer = 'Direct';
  if (rawReferrer) {
    try {
      const refUrl = new URL(rawReferrer);
      const host = refUrl.hostname.replace('www.', '');
      // Map common referrers to friendly names
      const referrerMap = {
        't.co': 'Twitter / X',
        'twitter.com': 'Twitter / X',
        'x.com': 'Twitter / X',
        'facebook.com': 'Facebook',
        'l.facebook.com': 'Facebook',
        'lm.facebook.com': 'Facebook',
        'instagram.com': 'Instagram',
        'l.instagram.com': 'Instagram',
        'linkedin.com': 'LinkedIn',
        'lnkd.in': 'LinkedIn',
        'youtube.com': 'YouTube',
        'youtu.be': 'YouTube',
        'reddit.com': 'Reddit',
        'old.reddit.com': 'Reddit',
        'tiktok.com': 'TikTok',
        'pinterest.com': 'Pinterest',
        'google.com': 'Google',
        'bing.com': 'Bing',
        'duckduckgo.com': 'DuckDuckGo',
        'mail.google.com': 'Gmail',
        'outlook.live.com': 'Outlook',
        'mail.yahoo.com': 'Yahoo Mail',
      };
      referrer = referrerMap[host] || host;
    } catch {
      referrer = rawReferrer.substring(0, 100);
    }
  }

  // Build click record (geo will be added async)
  const clickRecord = {
    id: uuidv4(),
    slug,
    timestamp: new Date().toISOString(),
    device,
    os: ua.os.name || 'Unknown',
    browser: ua.browser.name || 'Unknown',
    referrer,
    country: 'Unknown',
    region: 'Unknown',
    city: 'Unknown',
    ip: ip.substring(0, 6) + '***', // Partially masked for privacy
  };

  // Fire-and-forget geo lookup + save
  // We don't await this so the redirect is instant
  (async () => {
    try {
      if (ip !== '127.0.0.1' && ip !== '::1') {
        const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city`, {
          signal: AbortSignal.timeout(3000),
        });
        if (geoRes.ok) {
          const geo = await geoRes.json();
          if (geo.status === 'success') {
            clickRecord.country = geo.country || 'Unknown';
            clickRecord.region = geo.regionName || 'Unknown';
            clickRecord.city = geo.city || 'Unknown';
          }
        }
      }
    } catch {
      // Geo lookup failed, keep defaults
    }
    addClick(clickRecord);
  })();

  // Redirect immediately
  return NextResponse.redirect(link.destination, { status: 302 });
}
