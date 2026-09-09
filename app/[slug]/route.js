import { NextResponse } from 'next/server';
import { getLinkBySlug, addClick } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { UAParser } from 'ua-parser-js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { slug } = await params;

  const link = getLinkBySlug(slug);
  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const userAgent = request.headers.get('user-agent') || '';
  const parser = new UAParser(userAgent);
  const ua = parser.getResult();

  let device = 'Desktop';
  if (ua.device.type === 'mobile') device = 'Mobile';
  else if (ua.device.type === 'tablet') device = 'Tablet';

  // Cloudflare sets CF-Connecting-IP, otherwise fall back to x-forwarded-for
  const cfIp = request.headers.get('cf-connecting-ip');
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = cfIp || (forwarded ? forwarded.split(',')[0].trim() : realIp || '127.0.0.1');

  const rawReferrer = request.headers.get('referer') || '';
  let referrer = 'Direct';
  if (rawReferrer) {
    try {
      const refUrl = new URL(rawReferrer);
      const host = refUrl.hostname.replace('www.', '');
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
        'snapchat.com': 'Snapchat',
        'whatsapp.com': 'WhatsApp',
        'telegram.org': 'Telegram',
      };
      referrer = referrerMap[host] || host;
    } catch {
      referrer = rawReferrer.substring(0, 100);
    }
  }

  const clickRecord = {
    id: uuidv4(),
    slug,
    timestamp: new Date().toISOString(),
    device,
    os: ua.os.name || 'Unknown',
    osVersion: ua.os.version || '',
    browser: ua.browser.name || 'Unknown',
    browserVersion: ua.browser.version || '',
    deviceModel: ua.device.model || '',
    deviceVendor: ua.device.vendor || '',
    referrer,
    country: 'Unknown',
    countryCode: '',
    region: 'Unknown',
    city: 'Unknown',
    lat: null,
    lon: null,
    timezone: '',
    isp: '',
    ip: ip === '127.0.0.1' || ip === '::1' ? 'localhost' : ip.split('.').slice(0, 2).join('.') + '.*.*',
  };

  // Kick off the geo lookup in the background so the redirect is instant.
  // The click gets saved to disk once geo resolves (or after timeout).
  (async () => {
    try {
      const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
      if (!isLocal) {
        const geoRes = await fetch(
          `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,timezone,isp,org`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (geoRes.ok) {
          const geo = await geoRes.json();
          if (geo.status === 'success') {
            clickRecord.country = geo.country || 'Unknown';
            clickRecord.countryCode = geo.countryCode || '';
            clickRecord.region = geo.regionName || 'Unknown';
            clickRecord.city = geo.city || 'Unknown';
            clickRecord.lat = geo.lat ?? null;
            clickRecord.lon = geo.lon ?? null;
            clickRecord.timezone = geo.timezone || '';
            clickRecord.isp = geo.org || geo.isp || '';
          }
        }
      }
    } catch {
      // geo lookup timed out or failed - no big deal, we still have device data
    }
    addClick(clickRecord);
  })();

  return NextResponse.redirect(link.destination, { status: 302 });
}
