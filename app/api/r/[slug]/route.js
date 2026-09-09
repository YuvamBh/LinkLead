import { NextResponse, after } from 'next/server';
import { getLinkBySlug, addClick } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { UAParser } from 'ua-parser-js';

export const dynamic = 'force-dynamic';

function parseReferrer(rawReferrer) {
  if (!rawReferrer) return 'Direct';
  try {
    const refUrl = new URL(rawReferrer);
    const host = refUrl.hostname.replace('www.', '');
    const referrerMap = {
      't.co': 'Twitter / X',
      'twitter.com': 'Twitter / X',
      'x.com': 'Twitter / X',
      'facebook.com': 'Facebook',
      'l.facebook.com': 'Facebook',
      'instagram.com': 'Instagram',
      'linkedin.com': 'LinkedIn',
      'lnkd.in': 'LinkedIn',
      'youtube.com': 'YouTube',
      'reddit.com': 'Reddit',
      'tiktok.com': 'TikTok',
      'google.com': 'Google',
      'bing.com': 'Bing',
    };
    return referrerMap[host] || host;
  } catch {
    return rawReferrer.substring(0, 80);
  }
}

function extractClientIp(request) {
  const cfIp = request.headers.get('cf-connecting-ip');
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const vercelIp = request.headers.get('x-vercel-forwarded-for');

  const ip = (cfIp || (forwarded ? forwarded.split(',')[0].trim() : null) || vercelIp || realIp || '127.0.0.1').trim();
  return ip;
}

async function processClickTelemetry(slug, request, extraData = {}) {
  const userAgent = request.headers.get('user-agent') || '';
  const parser = new UAParser(userAgent);
  const ua = parser.getResult();

  let device = 'Desktop';
  if (ua.device.type === 'mobile') device = 'Mobile';
  else if (ua.device.type === 'tablet') device = 'Tablet';

  const rawIp = extractClientIp(request);
  const referrer = parseReferrer(request.headers.get('referer'));

  const clickRecord = {
    id: uuidv4(),
    slug,
    timestamp: new Date().toISOString(),
    ip: rawIp, // Unmasked full IP address
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
    postalCode: '',
    street: '',
    streetAddress: '',
    neighbourhood: '',
    fullAddress: '',
    lat: extraData.lat != null ? extraData.lat : null,
    lon: extraData.lon != null ? extraData.lon : null,
    timezone: '',
    isp: '',
    org: '',
    screen: extraData.screen || '',
    language: extraData.language || '',
  };

  // Perform geo resolution and reverse geocoding
  try {
    let lookupIp = rawIp;
    // On localhost, optionally resolve public IP so local testing shows real geo & street
    if (lookupIp === '127.0.0.1' || lookupIp === '::1' || lookupIp === 'localhost') {
      try {
        const pubRes = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(2000) });
        if (pubRes.ok) {
          const pubData = await pubRes.json();
          if (pubData.ip) {
            lookupIp = pubData.ip;
            clickRecord.ip = pubData.ip;
          }
        }
      } catch {}
    }

    if (lookupIp && lookupIp !== '127.0.0.1' && lookupIp !== '::1') {
      const geoUrl = `http://ip-api.com/json/${lookupIp}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,query`;
      const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(3000) });
      if (geoRes.ok) {
        const geo = await geoRes.json();
        if (geo.status === 'success') {
          clickRecord.country = geo.country || clickRecord.country;
          clickRecord.countryCode = geo.countryCode || '';
          clickRecord.region = geo.regionName || clickRecord.region;
          clickRecord.city = geo.city || clickRecord.city;
          clickRecord.postalCode = geo.zip || '';
          clickRecord.timezone = geo.timezone || '';
          clickRecord.isp = geo.isp || '';
          clickRecord.org = geo.org || '';
          if (clickRecord.lat == null) clickRecord.lat = geo.lat;
          if (clickRecord.lon == null) clickRecord.lon = geo.lon;
        }
      }
    }

    // If coordinates are available, reverse geocode to street and neighbourhood
    if (clickRecord.lat != null && clickRecord.lon != null) {
      try {
        const revUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${clickRecord.lat}&lon=${clickRecord.lon}&zoom=18&addressdetails=1`;
        const revRes = await fetch(revUrl, {
          headers: { 'User-Agent': 'LinkLead-Analytics/1.0 (contact@linklead.app)' },
          signal: AbortSignal.timeout(3500),
        });
        if (revRes.ok) {
          const revData = await revRes.json();
          const addr = revData.address || {};
          const road = addr.road || addr.pedestrian || addr.street || addr.footway || addr.avenue || addr.highway || '';
          const houseNumber = addr.house_number || '';
          const streetAddress = [houseNumber, road].filter(Boolean).join(' ');
          const neighbourhood = addr.neighbourhood || addr.suburb || addr.quarter || addr.residential || '';

          clickRecord.street = streetAddress || road || neighbourhood || '';
          clickRecord.streetAddress = streetAddress || road || '';
          clickRecord.neighbourhood = neighbourhood;
          clickRecord.fullAddress = revData.display_name || '';
          if (addr.postcode) clickRecord.postalCode = addr.postcode;
          if (addr.city || addr.town || addr.village) {
            clickRecord.city = addr.city || addr.town || addr.village;
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error('Geo enrichment error:', err);
  }

  await addClick(clickRecord);
  return clickRecord;
}

export async function GET(request, { params }) {
  const { slug } = await params;
  const link = await getLinkBySlug(slug);

  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  const acceptHeader = request.headers.get('accept') || '';
  const isFetch = acceptHeader.includes('application/json') || request.headers.get('sec-fetch-mode') === 'cors';

  // Process telemetry asynchronously with after() so response is instant
  after(async () => {
    try {
      await processClickTelemetry(slug, request);
    } catch (err) {
      console.error('Telemetry background error:', err);
    }
  });

  if (isFetch) {
    return NextResponse.json({ success: true, destination: link.destination });
  }

  return NextResponse.redirect(link.destination, { status: 302 });
}

export async function POST(request, { params }) {
  const { slug } = await params;
  const link = await getLinkBySlug(slug);

  if (!link) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  after(async () => {
    try {
      await processClickTelemetry(slug, request, body);
    } catch (err) {
      console.error('Telemetry POST background error:', err);
    }
  });

  return NextResponse.json({ success: true, destination: link.destination });
}
