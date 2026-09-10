import { NextResponse } from 'next/server';
import { getStats, getLinks } from '@/lib/db';
import { buildFullAnalysis } from '@/lib/ai-engine';

/**
 * GET /api/ai/analysis
 * 
 * Runs the full local analytics engine — zero API cost.
 * Returns trend, audience profile, opportunity score, tips, time patterns,
 * anomalies, forecast, and link grades.
 */
export async function GET() {
  try {
    const [stats, links] = await Promise.all([getStats(), getLinks()]);
    const analysis = buildFullAnalysis(stats, links);
    return NextResponse.json(analysis);
  } catch (error) {
    console.error('AI Analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to compute analysis' },
      { status: 500 }
    );
  }
}
