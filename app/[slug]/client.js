'use client';

import { useEffect, useState } from 'react';

/**
 * Client component rendered on the [slug] page.
 *
 * For real users: fires the click tracking request then immediately
 * redirects to the destination. The preview card shows for ~0.3s.
 *
 * For bots (WhatsApp, Twitter, iMessage, Slack, etc.): this component
 * is never executed — they only parse the server-rendered HTML with
 * the OG meta tags injected by generateMetadata.
 */
export default function LinkRedirectClient({ destination, slug, og }) {
  const [countdown, setCountdown] = useState(3);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    // Track the click
    fetch(`/api/r/${slug}`, { method: 'GET' }).catch(() => {});

    // Countdown then redirect
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          setRedirecting(true);
          window.location.href = destination;
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [destination, slug]);

  const hostname = (() => {
    try {
      return new URL(destination).hostname.replace(/^www\./, '');
    } catch {
      return destination;
    }
  })();

  const displayTitle = og?.title || hostname;
  const displayDesc = og?.description || destination;
  const displayImage = og?.image || null;
  const displaySite = og?.siteName || hostname;
  const favicon = og?.favicon || `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          background: #0a0a0f;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #f1f5f9;
          overflow: hidden;
        }

        /* Animated background */
        .bg {
          position: fixed;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.18) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 80% 80%, rgba(139,92,246,0.12) 0%, transparent 50%),
            #0a0a0f;
          z-index: 0;
        }

        .scene {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
          padding: 24px;
          max-width: 520px;
          width: 100%;
        }

        /* Badge */
        .badge {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(59,130,246,0.12);
          border: 1px solid rgba(59,130,246,0.25);
          border-radius: 100px;
          padding: 6px 16px;
          font-size: 12px;
          font-weight: 500;
          color: #93c5fd;
          letter-spacing: 0.02em;
        }

        .badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #3b82f6;
          animation: pulse 1.4s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }

        /* Preview card */
        .preview-card {
          width: 100%;
          background: rgba(15, 20, 40, 0.8);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          overflow: hidden;
          backdrop-filter: blur(20px);
          box-shadow:
            0 0 0 1px rgba(59,130,246,0.08),
            0 32px 64px rgba(0,0,0,0.5),
            0 16px 32px rgba(0,0,0,0.3);
          animation: cardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards;
        }

        @keyframes cardIn {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* OG image */
        .preview-image {
          width: 100%;
          aspect-ratio: 2 / 1;
          object-fit: cover;
          display: block;
          background: linear-gradient(135deg, #1e293b, #0f172a);
        }

        .preview-image-placeholder {
          width: 100%;
          aspect-ratio: 2 / 1;
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 48px;
          opacity: 0.5;
        }

        /* Card body */
        .preview-body {
          padding: 20px 22px 22px;
        }

        .preview-site {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }

        .preview-favicon {
          width: 18px;
          height: 18px;
          border-radius: 4px;
          object-fit: contain;
          flex-shrink: 0;
        }

        .preview-site-name {
          font-size: 12px;
          font-weight: 500;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .preview-title {
          font-size: 17px;
          font-weight: 600;
          color: #f1f5f9;
          line-height: 1.4;
          margin-bottom: 8px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .preview-desc {
          font-size: 13px;
          color: #64748b;
          line-height: 1.55;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .preview-url {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid rgba(255,255,255,0.06);
          font-size: 12px;
          color: #334155;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Redirect controls */
        .redirect-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          gap: 12px;
        }

        .redirect-label {
          font-size: 13px;
          color: #475569;
        }

        .redirect-label strong {
          color: #94a3b8;
        }

        .btn-go {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #3b82f6, #6366f1);
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          transition: opacity 0.15s, transform 0.15s;
          flex-shrink: 0;
        }

        .btn-go:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .btn-go svg {
          flex-shrink: 0;
        }

        /* Progress bar */
        .progress-bar-outer {
          width: 100%;
          height: 3px;
          background: rgba(255,255,255,0.06);
          border-radius: 2px;
          overflow: hidden;
        }

        .progress-bar-inner {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #6366f1);
          border-radius: 2px;
          animation: progress 3s linear forwards;
          transform-origin: left;
        }

        @keyframes progress {
          from { width: 0%; }
          to   { width: 100%; }
        }

        @media (max-width: 480px) {
          .preview-title { font-size: 15px; }
          .redirect-row { flex-direction: column; align-items: stretch; }
          .btn-go { justify-content: center; }
        }
      `}</style>

      <div className="bg" />

      <div className="scene">
        <div className="badge">
          <span className="badge-dot" />
          {redirecting ? 'Redirecting…' : `Redirecting in ${countdown}s`}
        </div>

        {/* Preview card — mirrors what WhatsApp/Twitter show */}
        <div className="preview-card">
          {displayImage ? (
            <img
              src={displayImage}
              alt={displayTitle}
              className="preview-image"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="preview-image-placeholder">🔗</div>
          )}

          <div className="preview-body">
            <div className="preview-site">
              <img
                src={favicon}
                alt=""
                className="preview-favicon"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <span className="preview-site-name">{displaySite}</span>
            </div>
            <div className="preview-title">{displayTitle}</div>
            {displayDesc && (
              <div className="preview-desc">{displayDesc}</div>
            )}
            <div className="preview-url">{destination}</div>
          </div>
        </div>

        {/* Progress + manual button */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="progress-bar-outer">
            <div className="progress-bar-inner" />
          </div>

          <div className="redirect-row">
            <span className="redirect-label">
              Taking you to <strong>{hostname}</strong>
            </span>
            <a href={destination} className="btn-go">
              Go now
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
