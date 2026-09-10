import { NextResponse } from 'next/server';
import { updateLink, getLinkBySlug } from '../../../../../lib/db.js';
import { classifyLink } from '../../../../../lib/classifier.js';

export const dynamic = 'force-dynamic';

// PATCH /api/admin/links/[slug]
// Updates a link's metadata: category, label, or re-classify on destination change
export async function PATCH(request, { params }) {
  const { slug } = await params;
  const body = await request.json();
  const { category, label, destination } = body;

  const existing = await getLinkBySlug(slug);
  if (!existing) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

  const patch = {};

  if (category !== undefined) patch.category = category;
  if (label !== undefined) patch.label = label;

  // If destination changed, re-classify
  if (destination && destination !== existing.destination) {
    patch.destination = destination;
    const classification = classifyLink(destination);
    if (!patch.category) {
      patch.category = classification.category;
      patch.categoryConfidence = classification.confidence;
      patch.tags = classification.tags || [];
    }
  }

  const result = await updateLink(slug, patch);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 404 });

  return NextResponse.json({ link: result.link });
}
