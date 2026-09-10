import { NextResponse } from 'next/server';
import { getCategories, getLinks } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/admin/categories
// Returns all unique categories with link count per category
export async function GET() {
  const [categories, links] = await Promise.all([getCategories(), getLinks()]);

  const counts = {};
  links.forEach(l => {
    const cat = l.category || 'Other';
    counts[cat] = (counts[cat] || 0) + 1;
  });

  const result = categories.map(cat => ({
    name: cat,
    count: counts[cat] || 0,
  })).sort((a, b) => b.count - a.count);

  return NextResponse.json({ categories: result });
}
