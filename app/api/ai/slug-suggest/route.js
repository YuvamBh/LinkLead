import { NextResponse } from 'next/server';
import { suggestSlugs } from '@/lib/ai-engine';

/**
 * POST /api/ai/slug-suggest
 * 
 * Generates smart slug suggestions from a destination URL.
 * Runs entirely locally — zero API cost.
 * 
 * Body: { destination: string }
 * Returns: { slugs: string[] }
 */
export async function POST(request) {
  try {
    const { destination } = await request.json();

    if (!destination || typeof destination !== 'string') {
      return NextResponse.json(
        { error: 'Destination URL is required' },
        { status: 400 }
      );
    }

    const slugs = suggestSlugs(destination.trim());

    return NextResponse.json({ slugs });
  } catch (error) {
    console.error('Slug suggestion error:', error);
    return NextResponse.json(
      { error: 'Failed to generate slug suggestions' },
      { status: 500 }
    );
  }
}
