import { getLinkBySlug } from '@/lib/db';
import { extractOgMetadata } from '@/lib/og';
import { notFound } from 'next/navigation';
import LinkRedirectClient from './client';

export const dynamic = 'force-dynamic';

function getSiteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://linklead-nine.vercel.app';
}

/**
 * generateMetadata — runs on the server at request time.
 * When WhatsApp, Twitter/X, iMessage, or Slack crawl this short link,
 * they parse these exact OpenGraph & Twitter tags to render the rich preview card.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const link = await getLinkBySlug(slug);

  if (!link) {
    return { title: 'Link Not Found' };
  }

  const origin = getSiteOrigin();
  const og = await extractOgMetadata(link.destination);

  const fallbackDomain = (() => {
    try {
      return new URL(link.destination).hostname.replace(/^www\./, '');
    } catch {
      return 'linklead.app';
    }
  })();

  const title = og?.title || fallbackDomain;
  const description = og?.description || `Click to view ${fallbackDomain}`;
  const siteName = og?.siteName || fallbackDomain;

  // If destination has a valid OG image, use it. Otherwise, use our dynamic 1200x630 OG image.
  // WhatsApp REQUIRES an image or it will drop the entire preview card.
  const image =
    og?.image ||
    `${origin}/api/og/image?title=${encodeURIComponent(title)}&domain=${encodeURIComponent(siteName)}&desc=${encodeURIComponent(description.slice(0, 100))}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${origin}/${slug}`,
      siteName,
      type: 'website',
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

/**
 * Server component page — renders HTML with injected OG meta tags for crawlers.
 * Real users run the client component for instant countdown redirect.
 */
export default async function SlugPage({ params }) {
  const { slug } = await params;
  const link = await getLinkBySlug(slug);

  if (!link) {
    notFound();
  }

  const og = await extractOgMetadata(link.destination);

  return (
    <LinkRedirectClient
      destination={link.destination}
      slug={slug}
      og={og}
    />
  );
}
