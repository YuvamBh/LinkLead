import { getLinkBySlug } from '@/lib/db';
import { notFound } from 'next/navigation';
import LinkRedirectClient from './client';

export const dynamic = 'force-dynamic';

/**
 * Fetches OG metadata from the destination URL.
 * Called at request-time on the server — bots/crawlers see the result as real meta tags.
 */
async function fetchOgMeta(destinationUrl) {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000');

    const apiUrl = `${baseUrl}/api/og?url=${encodeURIComponent(destinationUrl)}`;
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(9000),
      next: { revalidate: 3600 }, // cache 1 hour
    });

    if (res.ok) {
      return await res.json();
    }
  } catch {
    // If OG fetch fails, continue with defaults
  }
  return null;
}

/**
 * generateMetadata — runs on the server at request time.
 * When WhatsApp / Twitter / iMessage / Slack hit this URL,
 * they see these OG tags and render a rich preview card.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const link = await getLinkBySlug(slug);

  if (!link) {
    return { title: 'Link Not Found' };
  }

  const og = await fetchOgMeta(link.destination);

  const title = og?.title || link.destination;
  const description = og?.description || `Shared via LinkLead → ${link.destination}`;
  const image = og?.image || null;
  const siteName = og?.siteName || new URL(link.destination).hostname.replace(/^www\./, '');

  const meta = {
    title,
    description,
    openGraph: {
      title,
      description,
      url: link.destination,
      siteName,
      type: 'website',
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
    },
  };

  if (image) {
    meta.openGraph.images = [{ url: image }];
    meta.twitter.images = [image];
  }

  return meta;
}

/**
 * Server component page — renders minimal HTML with the OG meta tags injected.
 * The client component handles the instant redirect for real users.
 * Bots stop here, read the meta tags, and generate a preview card.
 */
export default async function SlugPage({ params }) {
  const { slug } = await params;
  const link = await getLinkBySlug(slug);

  if (!link) {
    notFound();
  }

  const og = await fetchOgMeta(link.destination);

  return (
    <LinkRedirectClient
      destination={link.destination}
      slug={slug}
      og={og}
    />
  );
}
