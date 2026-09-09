import { NextResponse } from 'next/server';
import { getClicks, getClicksBySlug } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');

  const clicks = slug ? await getClicksBySlug(slug) : await getClicks();

  const headers = [
    'Timestamp', 'Link Slug', 'Country', 'Country Code', 'Region', 'City',
    'Latitude', 'Longitude', 'Timezone', 'ISP',
    'Device', 'OS', 'OS Version', 'Browser', 'Browser Version',
    'Device Model', 'Device Vendor', 'Referrer', 'IP (masked)',
  ];

  const rows = clicks.map((c) => [
    c.timestamp, c.slug, c.country, c.countryCode || '', c.region, c.city,
    c.lat ?? '', c.lon ?? '', c.timezone || '', c.isp || '',
    c.device, c.os, c.osVersion || '', c.browser, c.browserVersion || '',
    c.deviceModel || '', c.deviceVendor || '', c.referrer, c.ip || '',
  ]);

  const csv = [
    headers.join(','),
    ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="linklead-export-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
