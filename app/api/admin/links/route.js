import { NextResponse } from 'next/server';
import { getLinks, addLink, deleteLink } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const links = await getLinks();
  return NextResponse.json({ links });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { slug, destination } = body;

    if (!slug || !destination) {
      return NextResponse.json({ error: 'Both slug and destination are required' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      return NextResponse.json(
        { error: 'Slug can only contain letters, numbers, hyphens, and underscores' },
        { status: 400 }
      );
    }

    try {
      new URL(destination);
    } catch {
      return NextResponse.json({ error: 'Invalid destination URL' }, { status: 400 });
    }

    const result = await addLink({ slug, destination });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({ link: result.link }, { status: 201 });
  } catch (err) {
    console.error('POST /api/admin/links error:', err);
    return NextResponse.json({ error: 'Server error: ' + err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ error: 'Slug is required' }, { status: 400 });
  }

  const result = await deleteLink(slug);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
