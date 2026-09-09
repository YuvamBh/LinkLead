/**
 * Helper to extract OpenGraph / Twitter metadata directly from a destination URL.
 * Runs in-process in server components and API routes (zero internal HTTP roundtrips).
 */

export async function extractOgMetadata(url) {
  if (!url) return null;

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const res = await fetch(url, {
      headers: {
        // Standard social crawler UA so Firebase/Google/shorteners immediately redirect to the final content
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return {
        title: parsedUrl.hostname,
        description: url,
        image: null,
        siteName: parsedUrl.hostname,
        favicon: `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&sz=128`,
        url,
      };
    }

    const html = await res.text();

    function getMeta(source, ...names) {
      for (const name of names) {
        const patterns = [
          new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
          new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i'),
        ];
        for (const re of patterns) {
          const m = source.match(re);
          if (m?.[1]) return m[1].trim();
        }
      }
      return null;
    }

    // 1. Title
    let title = getMeta(html, 'og:title', 'twitter:title');
    if (!title) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      title = titleMatch?.[1]?.trim() || parsedUrl.hostname;
    }

    // Decode HTML entities
    title = title
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'");

    // 2. Description
    let description = getMeta(html, 'og:description', 'twitter:description', 'description') || '';
    // Special extraction for Google Forms description if not in meta tags
    if (!description && html.includes('FB_PUBLIC_LOAD_DATA_')) {
      const fbDesc = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*\[null,\[\"([^\"]+)\"/);
      if (fbDesc?.[1]) description = fbDesc[1].trim();
    }

    description = description
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'");

    // 3. Image
    let image = getMeta(html, 'og:image', 'twitter:image', 'og:image:secure_url');
    if (image && !image.startsWith('http')) {
      try {
        image = new URL(image, res.url || url).href;
      } catch {
        image = null;
      }
    }

    // 4. Site Name
    let finalHost = parsedUrl.hostname.replace(/^www\./, '');
    try {
      if (res.url) {
        finalHost = new URL(res.url).hostname.replace(/^www\./, '');
      }
    } catch {}

    const siteName = getMeta(html, 'og:site_name') || finalHost;
    const favicon = `https://www.google.com/s2/favicons?domain=${finalHost}&sz=128`;

    return { title, description, image, siteName, favicon, url };
  } catch (err) {
    console.error('Failed to extract OG metadata:', err);
    return null;
  }
}
