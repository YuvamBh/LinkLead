import { NextResponse } from 'next/server';
import { extractOgMetadata } from '@/lib/og';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }

  const meta = await extractOgMetadata(url);
  if (!meta) {
    return NextResponse.json({ error: 'Failed to extract metadata' }, { status: 502 });
  }

  return NextResponse.json(meta, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800',
    },
  });
}
