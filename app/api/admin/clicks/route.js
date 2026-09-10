import { NextResponse } from 'next/server';
import { getStats } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');
  const category = searchParams.get('category');
  const stats = await getStats(slug || null, category || null);
  return NextResponse.json(stats);
}
