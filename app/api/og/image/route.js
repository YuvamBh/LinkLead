import { ImageResponse } from 'next/og';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get('title') || 'Shared Link').slice(0, 100);
  const domain = (searchParams.get('domain') || 'linklead.app').slice(0, 50);
  const desc = (searchParams.get('desc') || '').slice(0, 160);

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          backgroundColor: '#09090b',
          backgroundImage: 'radial-gradient(circle at 25px 25px, rgba(255, 255, 255, 0.05) 2%, transparent 0%), radial-gradient(circle at 75px 75px, rgba(59, 130, 246, 0.12) 0%, transparent 50%)',
          padding: '60px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '22px',
              fontWeight: 'bold',
            }}
          >
            ↗
          </div>
          <span style={{ fontSize: '22px', fontWeight: 600, color: '#93c5fd', letterSpacing: '-0.01em' }}>
            {domain}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '1040px' }}>
          <h1
            style={{
              fontSize: title.length > 50 ? '42px' : '52px',
              fontWeight: 700,
              color: '#f4f4f5',
              lineHeight: 1.25,
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </h1>
          {desc ? (
            <p
              style={{
                fontSize: '22px',
                color: '#a1a1aa',
                lineHeight: 1.4,
                margin: 0,
              }}
            >
              {desc}
            </p>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            paddingTop: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
            <span style={{ fontSize: '16px', color: '#71717a' }}>Verified Short Link</span>
          </div>
          <span style={{ fontSize: '16px', color: '#60a5fa', fontWeight: 500 }}>
            Tap to open ↗
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
