'use client';

import { useEffect } from 'react';

/**
 * Client component — fires click telemetry then immediately navigates
 * to the destination. No countdown, no preview card.
 *
 * Crawlers (WhatsApp, Twitter, iMessage, Slack) never execute this
 * component — they only parse the server-rendered <head> OG meta tags
 * injected by generateMetadata in page.js.
 */
export default function LinkRedirectClient({ destination, slug }) {
  useEffect(() => {
    // Fire telemetry without blocking the redirect
    fetch(`/api/r/${slug}`, { method: 'GET' }).catch(() => {});

    // Immediate redirect
    window.location.replace(destination);
  }, [destination, slug]);

  // Render nothing — user sees this for <100ms before redirect
  return null;
}
