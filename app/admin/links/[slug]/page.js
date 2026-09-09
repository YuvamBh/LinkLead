'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Chart from 'chart.js/auto';

export default function LinkAnalyticsPage() {
  const params = useParams();
  const linkSlug = params.slug;
  const router = useRouter();

  const [stats, setStats] = useState(null);
  const [linkInfo, setLinkInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  // QR Modal & Toast States
  const [qrOpen, setQrOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const lineChartRef = useRef(null);
  const donutChartRef = useRef(null);
  const lineChartInstance = useRef(null);
  const donutChartInstance = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 2800);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, linksRes] = await Promise.all([
        fetch(`/api/admin/clicks?slug=${encodeURIComponent(linkSlug)}`),
        fetch('/api/admin/links'),
      ]);
      const statsData = await statsRes.json();
      const linksData = await linksRes.json();
      setStats(statsData);
      const info = (linksData.links || []).find((l) => l.slug === linkSlug);
      setLinkInfo(info || null);
    } catch (err) {
      console.error('Failed to sync link telemetry:', err);
    }
    setLoading(false);
  }, [linkSlug]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Render Charts
  useEffect(() => {
    if (!stats) return;

    // Line Chart
    if (lineChartRef.current) {
      if (lineChartInstance.current) lineChartInstance.current.destroy();
      const ctx = lineChartRef.current.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 0, 240);
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.22)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

      lineChartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: stats.chart.labels.map((l) => {
            const d = new Date(l);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }),
          datasets: [{
            label: 'Clicks',
            data: stats.chart.data,
            borderColor: '#3b82f6',
            backgroundColor: gradient,
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: '#60a5fa',
            pointHoverBorderColor: '#09090b',
            pointHoverBorderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#181b22',
              titleColor: '#f4f4f5',
              bodyColor: '#a1a1aa',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 12,
              cornerRadius: 8,
              displayColors: false,
              callbacks: {
                label: (context) => `${context.parsed.y} click${context.parsed.y === 1 ? '' : 's'}`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.03)' },
              ticks: { color: '#71717a', font: { size: 11 }, maxTicksLimit: 8 },
              border: { display: false },
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(255, 255, 255, 0.03)' },
              ticks: { color: '#71717a', font: { size: 11 }, precision: 0 },
              border: { display: false },
            },
          },
        },
      });
    }

    // Donut Chart
    if (donutChartRef.current) {
      if (donutChartInstance.current) donutChartInstance.current.destroy();
      const deviceData = stats.devices || {};
      const labels = Object.keys(deviceData).filter((k) => deviceData[k] > 0);
      const values = labels.map((k) => deviceData[k]);
      const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#71717a'];

      donutChartInstance.current = new Chart(donutChartRef.current, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: values.length > 0 ? values : [1],
            backgroundColor: values.length > 0 ? colors.slice(0, labels.length) : ['rgba(255, 255, 255, 0.05)'],
            borderColor: '#12141a',
            borderWidth: 3,
            hoverOffset: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '74%',
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: values.length > 0,
              backgroundColor: '#181b22',
              titleColor: '#f4f4f5',
              bodyColor: '#a1a1aa',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 10,
              cornerRadius: 8,
              displayColors: false,
            },
          },
        },
      });
    }

    return () => {
      if (lineChartInstance.current) lineChartInstance.current.destroy();
      if (donutChartInstance.current) donutChartInstance.current.destroy();
    };
  }, [stats]);

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const fullShortUrl = `${originUrl}/${linkSlug}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullShortUrl);
      showToast('Link copied to clipboard');
    } catch {
      showToast('Failed to copy', 'error');
    }
  };

  const handleExport = () => {
    window.open(`/api/admin/export?slug=${encodeURIComponent(linkSlug)}`, '_blank');
  };

  const timeAgo = (timestamp) => {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner-ring" />
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading link telemetry...</span>
      </div>
    );
  }

  const topCountry = stats?.countries?.[0]?.name || 'N/A';
  const mobilePercent = stats?.totalClicks > 0
    ? Math.round(((stats.devices?.Mobile || 0) / stats.totalClicks) * 100)
    : 0;

  return (
    <div className="app-shell">
      {/* ── Top Header ─────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-container">
          <div className="brand-section">
            <a href="/admin" className="brand-logo">
              <div className="brand-mark">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </div>
              <span className="brand-name">LinkLead</span>
            </a>
            <div className="brand-divider" />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Link Drilldown</span>
          </div>

          <div className="header-actions">
            <button className="btn btn-secondary" onClick={handleExport}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Export CSV</span>
            </button>
            <button className="btn btn-ghost" onClick={() => router.push('/admin')}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* ── Content Container ──────────────────────────────────────────── */}
      <main className="main-container">
        {/* Breadcrumb Navigation */}
        <div className="breadcrumb-bar">
          <a href="/admin" className="breadcrumb-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9"/>
              <rect x="14" y="3" width="7" height="5"/>
              <rect x="14" y="12" width="7" height="9"/>
              <rect x="3" y="16" width="7" height="5"/>
            </svg>
            Dashboard
          </a>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-link">Links</span>
          <span className="breadcrumb-separator">/</span>
          <span className="breadcrumb-current">/{linkSlug}</span>
        </div>

        {/* Hero Card for this Link */}
        <div className="link-hero-card">
          <div className="link-hero-main">
            <div className="link-hero-slug">
              <span>/{linkSlug}</span>
              <span className="status-pill">Active</span>
            </div>
            {linkInfo && (
              <div className="link-hero-destination">
                <span>Directs to:</span>
                <a href={linkInfo.destination} target="_blank" rel="noopener noreferrer">
                  {linkInfo.destination}
                </a>
              </div>
            )}
          </div>

          <div className="link-hero-actions">
            <button className="btn btn-secondary" onClick={handleCopy}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              <span>Copy Short Link</span>
            </button>

            <button className="btn btn-secondary" onClick={() => setQrOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
              </svg>
              <span>QR Code</span>
            </button>
          </div>
        </div>

        {/* KPI Metrics */}
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-title">Total Clicks</span>
              <div className="kpi-icon-wrapper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </div>
            </div>
            <div className="kpi-value">{stats?.totalClicks?.toLocaleString() || 0}</div>
            <div className="kpi-subtext">All-time redirects</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-title">Top Origin</span>
              <div className="kpi-icon-wrapper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
            </div>
            <div className="kpi-value" style={{ fontSize: topCountry.length > 12 ? '20px' : '28px' }}>
              {topCountry}
            </div>
            <div className="kpi-subtext">Top visitor country</div>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-title">Mobile Share</span>
              <div className="kpi-icon-wrapper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                  <line x1="12" y1="18" x2="12.01" y2="18"/>
                </svg>
              </div>
            </div>
            <div className="kpi-value">{mobilePercent}%</div>
            <div className="kpi-subtext">Handheld devices</div>
          </div>
        </div>

        {/* Charts */}
        <div className="analytics-charts-grid">
          <div className="surface-card">
            <div className="card-header-bar">
              <span className="card-heading">Click Trends</span>
              <span className="card-heading-meta">Last 30 days</span>
            </div>
            <div className="chart-wrapper">
              <canvas ref={lineChartRef} />
            </div>
          </div>

          <div className="surface-card">
            <div className="card-header-bar">
              <span className="card-heading">Devices</span>
            </div>
            <div className="donut-wrapper">
              <div className="donut-chart-canvas">
                <canvas ref={donutChartRef} />
              </div>
              <div className="donut-legend-list">
                {Object.entries(stats?.devices || {})
                  .filter(([, count]) => count > 0)
                  .map(([name, count], i) => {
                    const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#71717a'];
                    const total = stats.totalClicks || 1;
                    const pct = Math.round((count / total) * 100);
                    return (
                      <div key={name} className="donut-legend-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="legend-swatch" style={{ background: colors[i % colors.length] }} />
                          <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
                        </div>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {count} <span style={{ color: 'var(--text-muted)' }}>({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>

        {/* Breakdowns */}
        <div className="breakdowns-three-col">
          <div className="surface-card">
            <div className="card-header-bar">
              <span className="card-heading">Top Countries</span>
            </div>
            <div className="metric-bar-list">
              {stats?.countries?.length > 0 ? (
                stats.countries.slice(0, 5).map((item) => (
                  <div key={item.name} className="metric-bar-item">
                    <div className="metric-bar-info">
                      <span className="metric-bar-name">{item.name}</span>
                      <span className="metric-bar-count">{item.count}</span>
                    </div>
                    <div className="metric-bar-track">
                      <div
                        className="metric-bar-fill"
                        style={{ width: `${(item.count / stats.countries[0].count) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state-view" style={{ padding: '24px 0' }}>
                  <p className="empty-state-desc">No geo data captured</p>
                </div>
              )}
            </div>
          </div>

          <div className="surface-card">
            <div className="card-header-bar">
              <span className="card-heading">Traffic Sources</span>
            </div>
            <div className="metric-bar-list">
              {stats?.referrers?.length > 0 ? (
                stats.referrers.slice(0, 5).map((item) => (
                  <div key={item.name} className="metric-bar-item">
                    <div className="metric-bar-info">
                      <span className="metric-bar-name">{item.name}</span>
                      <span className="metric-bar-count">{item.count}</span>
                    </div>
                    <div className="metric-bar-track">
                      <div
                        className="metric-bar-fill emerald"
                        style={{ width: `${(item.count / stats.referrers[0].count) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state-view" style={{ padding: '24px 0' }}>
                  <p className="empty-state-desc">No referrer data captured</p>
                </div>
              )}
            </div>
          </div>

          <div className="surface-card">
            <div className="card-header-bar">
              <span className="card-heading">Browsers</span>
            </div>
            <div className="metric-bar-list">
              {stats?.browsers?.length > 0 ? (
                stats.browsers.slice(0, 5).map((item) => (
                  <div key={item.name} className="metric-bar-item">
                    <div className="metric-bar-info">
                      <span className="metric-bar-name">{item.name}</span>
                      <span className="metric-bar-count">{item.count}</span>
                    </div>
                    <div className="metric-bar-track">
                      <div
                        className="metric-bar-fill amber"
                        style={{ width: `${(item.count / stats.browsers[0].count) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state-view" style={{ padding: '24px 0' }}>
                  <p className="empty-state-desc">No browser data captured</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Click Telemetry Log */}
        <div className="surface-card">
          <div className="card-header-bar">
            <span className="card-heading">Click Telemetry Log</span>
            <span className="card-heading-meta">Recent visitor events for this link</span>
          </div>

          <div className="telemetry-feed">
            {stats?.recentClicks?.length > 0 ? (
              stats.recentClicks.map((click) => (
                <div key={click.id} className="telemetry-item">
                  <div className="telemetry-left">
                    <div className="telemetry-indicator" />
                    <div className="telemetry-info">
                      <div className="telemetry-main">
                        <span style={{ fontWeight: 600 }}>
                          {click.streetAddress || click.street
                            ? `${click.streetAddress || click.street}, ${click.city && click.city !== 'Unknown' ? `${click.city}, ` : ''}${click.country && click.country !== 'Unknown' ? click.country : ''}`
                            : click.city && click.city !== 'Unknown'
                            ? `${click.city}, ${click.country}`
                            : click.country !== 'Unknown'
                            ? click.country
                            : 'Location Pending'}
                        </span>
                      </div>

                      {click.fullAddress && (
                        <div className="telemetry-full-addr">
                          📍 {click.fullAddress}
                        </div>
                      )}

                      <div className="telemetry-chips">
                        {click.ip && (
                          <span className="chip chip-ip" title="Unmasked visitor IP">
                            IP: {click.ip}
                          </span>
                        )}
                        {(click.streetAddress || click.street) && (
                          <span className="chip chip-street">
                            📍 {click.streetAddress || click.street}
                          </span>
                        )}
                        <span className="chip">{click.device} · {click.os}</span>
                        <span className="chip">{click.browser}</span>
                        <span className="chip">via {click.referrer || 'Direct'}</span>
                        {click.lat != null && click.lon != null && (
                          <span className="chip chip-geo">
                            {click.lat.toFixed(4)}, {click.lon.toFixed(4)}
                          </span>
                        )}
                        {click.isp && click.isp !== 'Unknown' && (
                          <span className="chip">{click.isp}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="telemetry-time">
                    {timeAgo(click.timestamp)}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state-view">
                <div className="empty-state-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                </div>
                <div className="empty-state-title">No clicks recorded yet</div>
                <p className="empty-state-desc">Share your short link to start receiving visitor telemetry.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* QR Code Modal */}
      {qrOpen && (
        <div className="modal-backdrop" onClick={() => setQrOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px' }}>
            <div className="modal-header">
              <div className="modal-title-group">
                <h3>QR Code</h3>
                <p>/{linkSlug}</p>
              </div>
              <button className="btn-icon" onClick={() => setQrOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div className="qr-preview-box">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(fullShortUrl)}&color=09090b&bgcolor=ffffff&qzone=1`}
                  alt={`QR Code for /${linkSlug}`}
                  width="220"
                  height="220"
                  style={{ borderRadius: '4px' }}
                />
              </div>
              <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                Scan to instantly test redirect on your mobile device
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn btn-secondary" onClick={handleCopy}>
                Copy URL
              </button>
              <a
                className="btn btn-primary"
                href={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(fullShortUrl)}&color=09090b&bgcolor=ffffff`}
                download={`qr-${linkSlug}.png`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download PNG
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            <span className="toast-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
