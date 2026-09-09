import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Fetches Open Graph / meta preview data from a given URL.
 * Used by the [slug] page to populate its own OG meta tags so
 * link previews (WhatsApp, Twitter, iMessage, Slack, etc.) show
 * the actual destination's title, description, and image.
 *
 * GET /api/og?url=https://example.com
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }

  // Basic sanity check
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Bad protocol');
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        // Pretend to be a browser so sites don't block us
        'User-Agent':
          'Mozilla/5.0 (compatible; LinkLeadBot/1.0; +https://linklead.app) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 502 });
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      // For non-HTML (images, PDFs, etc.) just return minimal info
      return NextResponse.json({
        title: parsedUrl.hostname,
        description: url,
        image: null,
        siteName: parsedUrl.hostname,
        url,
      });
    }

    // Only read the first 80KB — enough to capture all <head> meta tags
    const reader = res.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    const MAX_BYTES = 80 * 1024;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalBytes += value.length;
      if (totalBytes >= MAX_BYTES) {
        reader.cancel();
        break;
      }
    }

    const html = new TextDecoder().decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.length + chunk.length);
        merged.set(acc, 0);
        merged.set(chunk, acc.length);
        return merged;
      }, new Uint8Array(0))
    );

    // Helper: extract a meta tag value
    function getMeta(html, ...names) {
      for (const name of names) {
        // og:xxx, twitter:xxx, name="description" etc.
        const patterns = [
          new RegExp(
            `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
            'i'
          ),
          new RegExp(
            `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
            'i'
          ),
        ];
        for (const re of patterns) {
          const m = html.match(re);
          if (m?.[1]) return m[1].trim();
        }
      }
      return null;
    }

    // Extract title (OG title takes priority)
    let title = getMeta(html, 'og:title', 'twitter:title');
    if (!title) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      title = titleMatch?.[1]?.trim() || parsedUrl.hostname;
    }

    // Decode HTML entities in title
    title = title
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'");

    const description =
      getMeta(html, 'og:description', 'twitter:description', 'description') || '';

    let image = getMeta(html, 'og:image', 'twitter:image', 'og:image:secure_url');
    // Resolve relative image URLs
    if (image && !image.startsWith('http')) {
      try {
        image = new URL(image, url).href;
      } catch {
        image = null;
      }
    }

    const siteName =
      getMeta(html, 'og:site_name') ||
      parsedUrl.hostname.replace(/^www\./, '');

    const favicon = `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&sz=64`;

    return NextResponse.json(
      { title, description, image, siteName, favicon, url },
      {
        headers: {
          // Cache for 1 hour in CDN / 30 min on client
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800',
        },
      }
    );
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    return NextResponse.json(
      { error: isTimeout ? 'Request timed out' : 'Failed to fetch page' },
      { status: 502 }
    );
  }
}
