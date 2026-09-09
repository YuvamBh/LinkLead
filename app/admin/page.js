'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Chart from 'chart.js/auto';

export default function AdminDashboard() {
  const [activeView, setActiveView] = useState('overview'); // 'overview' | 'links' | 'activity'
  const [stats, setStats] = useState(null);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter in Links view
  const [searchQuery, setSearchQuery] = useState('');

  // Creation Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [destination, setDestination] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdResult, setCreatedResult] = useState(null);

  // QR Modal State
  const [qrModalLink, setQrModalLink] = useState(null);

  // Toast State
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  // Delete Action State
  const [deletingSlug, setDeletingSlug] = useState(null);

  // Chart References
  const lineChartRef = useRef(null);
  const donutChartRef = useRef(null);
  const lineChartInstance = useRef(null);
  const donutChartInstance = useRef(null);

  const router = useRouter();

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
        fetch('/api/admin/clicks', { cache: 'no-store' }),
        fetch('/api/admin/links', { cache: 'no-store' }),
      ]);
      const statsData = await statsRes.json();
      const linksData = await linksRes.json();
      setStats(statsData);
      setLinks(linksData.links || []);
    } catch (err) {
      console.error('Failed to sync telemetry:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Keyboard shortcut listener: 'N' to open new link modal, 'Escape' to close modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsCreateOpen(false);
        setQrModalLink(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Render Charts when on Overview view
  useEffect(() => {
    if (!stats || activeView !== 'overview') return;

    // Line Chart: Click Trends
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
              titleFont: { size: 12, weight: '600' },
              bodyFont: { size: 13, weight: '500' },
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

    // Donut Chart: Device Distribution
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
  }, [stats, activeView]);

  // Handle Link Creation
  const handleCreateLink = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);

    let cleanDestination = destination.trim();
    if (!cleanDestination.startsWith('http://') && !cleanDestination.startsWith('https://')) {
      cleanDestination = `https://${cleanDestination}`;
    }

    const cleanSlug = slug.trim().replace(/[^a-zA-Z0-9_-]/g, '');

    try {
      const res = await fetch('/api/admin/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: cleanSlug, destination: cleanDestination }),
      });

      const data = await res.json();
      if (res.ok) {
        const fullShortUrl = `${window.location.origin}/${data.link.slug}`;
        setCreatedResult({ slug: data.link.slug, fullUrl: fullShortUrl });
        setSlug('');
        setDestination('');
        fetchData();
        showToast(`/${data.link.slug} created successfully`);
        // Copy to clipboard immediately
        navigator.clipboard.writeText(fullShortUrl).catch(() => {});
      } else {
        setCreateError(data.error || 'Failed to create link');
      }
    } catch {
      setCreateError('Connection error. Please try again.');
    }

    setCreating(false);
  };

  // Handle Copy to Clipboard
  const handleCopyLink = async (shortUrl, customMsg) => {
    try {
      await navigator.clipboard.writeText(shortUrl);
      showToast(customMsg || 'Link copied to clipboard');
    } catch {
      showToast('Failed to copy', 'error');
    }
  };

  // Handle Link Deletion
  const handleDeleteLink = async (linkSlug) => {
    if (!confirm(`Permanently delete /${linkSlug}? Click records will be preserved in aggregate analytics.`)) {
      return;
    }

    setDeletingSlug(linkSlug);
    setLinks((prev) => prev.filter((l) => l.slug !== linkSlug));

    try {
      const res = await fetch(`/api/admin/links?slug=${encodeURIComponent(linkSlug)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        fetchData();
        showToast('Delete failed. Please retry.', 'error');
      } else {
        fetchData();
        showToast(`/${linkSlug} deleted`);
      }
    } catch {
      fetchData();
      showToast('Network error during deletion', 'error');
    }

    setDeletingSlug(null);
  };

  const handleLogout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/login');
  };

  const handleExport = () => {
    window.open('/api/admin/export', '_blank');
  };

  // Filtered links based on search query
  const filteredLinks = useMemo(() => {
    if (!searchQuery.trim()) return links;
    const q = searchQuery.toLowerCase();
    return links.filter(
      (l) => l.slug.toLowerCase().includes(q) || (l.destination && l.destination.toLowerCase().includes(q))
    );
  }, [links, searchQuery]);

  // Relative time formatter
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
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading LinkLead console...</span>
      </div>
    );
  }

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const topCountry = stats?.countries?.[0]?.name || 'N/A';
  const mobilePercent = stats?.totalClicks > 0
    ? Math.round(((stats.devices?.Mobile || 0) / stats.totalClicks) * 100)
    : 0;

  return (
    <div className="app-shell">
      {/* ── Top Navigation Header ────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-container">
          <div className="brand-section">
            <div className="brand-logo">
              <div className="brand-mark">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </div>
              <span className="brand-name">LinkLead</span>
            </div>
            <div className="brand-divider" />
            <div className="status-pill">
              <span className="status-dot-pulse" />
              <span>Live Console</span>
            </div>
          </div>

          <div className="header-actions">
            <button className="btn btn-secondary" onClick={handleExport} title="Download CSV report">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>Export CSV</span>
            </button>

            <button
              className="btn btn-primary"
              onClick={() => {
                setCreatedResult(null);
                setCreateError('');
                setIsCreateOpen(true);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>New Link</span>
            </button>

            <button className="btn-icon" onClick={handleLogout} title="Sign out of console">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── View Navigation Tabs Bar ─────────────────────────────────────── */}
      <div className="view-nav-bar">
        <div className="view-nav-container">
          <div className="view-tabs">
            <button
              className={`view-tab ${activeView === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveView('overview')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9"/>
                <rect x="14" y="3" width="7" height="5"/>
                <rect x="14" y="12" width="7" height="9"/>
                <rect x="3" y="16" width="7" height="5"/>
              </svg>
              <span>Overview</span>
            </button>

            <button
              className={`view-tab ${activeView === 'links' ? 'active' : ''}`}
              onClick={() => setActiveView('links')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
              <span>Links</span>
              <span className="badge">{links.length}</span>
            </button>

            <button
              className={`view-tab ${activeView === 'activity' ? 'active' : ''}`}
              onClick={() => setActiveView('activity')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              <span>Live Stream</span>
              {stats?.recentClicks?.length > 0 && (
                <span className="badge">{stats.recentClicks.length}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Main View Content ────────────────────────────────────────────── */}
      <main className="main-container">

        {/* ════════════ VIEW 1: OVERVIEW ════════════ */}
        {activeView === 'overview' && (
          <>
            {/* KPI Metric Cards */}
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-title">Total Redirects</span>
                  <div className="kpi-icon-wrapper">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                  </div>
                </div>
                <div className="kpi-value">{stats?.totalClicks?.toLocaleString() || 0}</div>
                <div className="kpi-subtext">
                  <span className="kpi-trend">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="18 15 12 9 6 15"/>
                    </svg>
                    Live
                  </span>
                  <span>Captured telemetry</span>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-title">Active Links</span>
                  <div className="kpi-icon-wrapper">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                  </div>
                </div>
                <div className="kpi-value">{stats?.totalLinks || links.length || 0}</div>
                <div className="kpi-subtext">
                  <span>Routing destinations</span>
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-title">Top Country</span>
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
                <div className="kpi-subtext">
                  <span>Primary traffic origin</span>
                </div>
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
                <div className="kpi-subtext">
                  <span>Smartphones & handhelds</span>
                </div>
              </div>
            </div>

            {/* Charts Grid */}
            <div className="analytics-charts-grid">
              <div className="surface-card">
                <div className="card-header-bar">
                  <span className="card-heading">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    Click Velocity (30 Days)
                  </span>
                  <span className="card-heading-meta">Aggregated daily clicks</span>
                </div>
                <div className="chart-wrapper">
                  <canvas ref={lineChartRef} />
                </div>
              </div>

              <div className="surface-card">
                <div className="card-header-bar">
                  <span className="card-heading">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                    </svg>
                    Device Hardware
                  </span>
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

            {/* Breakdowns Grid */}
            <div className="breakdowns-three-col">
              {/* Countries */}
              <div className="surface-card">
                <div className="card-header-bar">
                  <span className="card-heading">Top Locations</span>
                  <span className="card-heading-meta">By clicks</span>
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
                      <p className="empty-state-desc">No geographical data captured yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Referrers */}
              <div className="surface-card">
                <div className="card-header-bar">
                  <span className="card-heading">Traffic Sources</span>
                  <span className="card-heading-meta">By channel</span>
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
                      <p className="empty-state-desc">No referrer sources recorded yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Browsers */}
              <div className="surface-card">
                <div className="card-header-bar">
                  <span className="card-heading">Browsers</span>
                  <span className="card-heading-meta">By agent</span>
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
                      <p className="empty-state-desc">No browser telemetry recorded yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ════════════ VIEW 2: LINKS MANAGEMENT ════════════ */}
        {activeView === 'links' && (
          <div className="surface-card">
            <div className="table-toolbar">
              <div className="search-input-box">
                <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search slug or destination..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {filteredLinks.length} link{filteredLinks.length === 1 ? '' : 's'}
                </span>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setCreatedResult(null);
                    setCreateError('');
                    setIsCreateOpen(true);
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  <span>New Link</span>
                </button>
              </div>
            </div>

            <div className="table-scroller">
              {filteredLinks.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Short Link</th>
                      <th>Destination URL</th>
                      <th>Created</th>
                      <th>Clicks</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLinks.map((link) => {
                      const fullUrl = `${originUrl}/${link.slug}`;
                      // Find click count from stats
                      const linkStat = stats?.topLinks?.find((tl) => tl.slug === link.slug);
                      const clickCount = linkStat ? linkStat.count : 0;

                      return (
                        <tr key={link.slug} style={{ opacity: deletingSlug === link.slug ? 0.35 : 1 }}>
                          <td>
                            <div className="slug-cell">
                              <a href={`/admin/links/${link.slug}`} className="slug-badge">
                                /{link.slug}
                              </a>
                            </div>
                          </td>
                          <td>
                            <div className="url-destination">
                              <a href={link.destination} target="_blank" rel="noopener noreferrer">
                                {link.destination}
                              </a>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                            {new Date(link.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </td>
                          <td>
                            <span className="clicks-badge">
                              {clickCount}
                            </span>
                          </td>
                          <td>
                            <div className="table-row-actions">
                              <button
                                className="btn-icon"
                                onClick={() => handleCopyLink(fullUrl)}
                                title="Copy short link"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg>
                              </button>

                              <button
                                className="btn-icon"
                                onClick={() => setQrModalLink({ slug: link.slug, fullUrl })}
                                title="View QR Code"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="3" width="7" height="7"/>
                                  <rect x="14" y="3" width="7" height="7"/>
                                  <rect x="14" y="14" width="7" height="7"/>
                                  <rect x="3" y="14" width="7" height="7"/>
                                </svg>
                              </button>

                              <a
                                href={`/admin/links/${link.slug}`}
                                className="btn-icon"
                                title="Inspect analytics"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                                </svg>
                              </a>

                              <button
                                className="btn-icon btn-danger-ghost"
                                onClick={() => handleDeleteLink(link.slug)}
                                disabled={deletingSlug === link.slug}
                                title="Delete link"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"/>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state-view">
                  <div className="empty-state-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                  </div>
                  <div className="empty-state-title">
                    {searchQuery ? 'No matching tracking links' : 'No links created yet'}
                  </div>
                  <p className="empty-state-desc">
                    {searchQuery
                      ? 'Try adjusting your search criteria'
                      : 'Generate your first short tracking link to begin capturing analytics.'}
                  </p>
                  {!searchQuery && (
                    <button
                      className="btn btn-primary"
                      style={{ marginTop: '16px' }}
                      onClick={() => setIsCreateOpen(true)}
                    >
                      Create First Link
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════ VIEW 3: LIVE ACTIVITY STREAM ════════════ */}
        {activeView === 'activity' && (
          <div className="surface-card">
            <div className="card-header-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="status-dot-pulse" />
                <span className="card-heading">Real-Time Telemetry Stream</span>
              </div>
              <span className="card-heading-meta">Auto-syncing every 10s</span>
            </div>

            <div className="telemetry-feed">
              {stats?.recentClicks?.length > 0 ? (
                stats.recentClicks.map((click) => (
                  <div key={click.id} className="telemetry-item">
                    <div className="telemetry-left">
                      <div className="telemetry-indicator" />
                      <div className="telemetry-info">
                        <div className="telemetry-main">
                          <a href={`/admin/links/${click.slug}`} className="telemetry-slug-link">
                            /{click.slug}
                          </a>
                          <span style={{ color: 'var(--text-muted)' }}>→</span>
                          <span>
                            {click.city && click.city !== 'Unknown'
                              ? `${click.city}, ${click.country}`
                              : click.country !== 'Unknown'
                              ? click.country
                              : 'Location Pending'}
                          </span>
                        </div>

                        <div className="telemetry-chips">
                          <span className="chip">
                            {click.device} · {click.os}{click.osVersion ? ` ${click.osVersion}` : ''}
                          </span>
                          <span className="chip">
                            {click.browser}{click.browserVersion ? ` ${click.browserVersion.split('.')[0]}` : ''}
                          </span>
                          <span className="chip">
                            via {click.referrer || 'Direct'}
                          </span>
                          {click.lat != null && (
                            <span className="chip chip-geo">
                              {click.lat.toFixed(2)}, {click.lon.toFixed(2)}
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
                  <div className="empty-state-title">Listening for incoming clicks</div>
                  <p className="empty-state-desc">
                    When visitors click your tracking links, rich metadata will stream in here in real-time.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Modal: Create Tracking Link ──────────────────────────────────── */}
      {isCreateOpen && (
        <div className="modal-backdrop" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <h3>Create Tracking Link</h3>
                <p>Generate a redirect link with instant telemetry capture</p>
              </div>
              <button className="btn-icon" onClick={() => setIsCreateOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {createdResult ? (
              <div className="modal-body" style={{ textAlign: 'center', padding: '32px 24px' }}>
                <div className="status-dot-pulse" style={{ margin: '0 auto 12px', width: '10px', height: '10px' }} />
                <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>Link Ready & Copied!</h4>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  The tracking URL has been copied to your clipboard.
                </p>

                <div className="input-container" style={{ marginBottom: '20px' }}>
                  <input
                    type="text"
                    className="text-input"
                    readOnly
                    value={createdResult.fullUrl}
                    style={{ textAlign: 'center', color: '#93c5fd', fontFamily: 'JetBrains Mono' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleCopyLink(createdResult.fullUrl, 'Copied!')}
                  >
                    Copy Again
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setCreatedResult(null);
                      setIsCreateOpen(false);
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateLink}>
                <div className="modal-body">
                  <div className="form-field">
                    <label className="form-label" htmlFor="dest-url">
                      <span>Destination URL</span>
                      <span className="form-label-hint">Where visitors land</span>
                    </label>
                    <div className="input-container">
                      <input
                        id="dest-url"
                        type="text"
                        className="text-input"
                        placeholder="https://yourdomain.com/landing-page"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        autoFocus
                        required
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <label className="form-label" htmlFor="custom-slug">
                      <span>Custom Slug</span>
                      <span className="form-label-hint">Alphanumeric & dashes</span>
                    </label>
                    <div className="input-container">
                      <span className="input-prefix">
                        {typeof window !== 'undefined' ? `${window.location.host}/` : '/'}
                      </span>
                      <input
                        id="custom-slug"
                        type="text"
                        className="text-input"
                        placeholder="launch-2026"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                        required
                      />
                    </div>
                  </div>

                  {createError && (
                    <div className="auth-error-banner">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <span>{createError}</span>
                    </div>
                  )}
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setIsCreateOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={creating}
                  >
                    {creating ? 'Generating...' : 'Create Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: QR Code Preview ───────────────────────────────────────── */}
      {qrModalLink && (
        <div className="modal-backdrop" onClick={() => setQrModalLink(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px' }}>
            <div className="modal-header">
              <div className="modal-title-group">
                <h3>QR Code</h3>
                <p>/{qrModalLink.slug}</p>
              </div>
              <button className="btn-icon" onClick={() => setQrModalLink(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="modal-body" style={{ textAlign: 'center' }}>
              <div className="qr-preview-box">
                {/* Clean QR code rendered via SVG service */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrModalLink.fullUrl)}&color=09090b&bgcolor=ffffff&qzone=1`}
                  alt={`QR Code for /${qrModalLink.slug}`}
                  width="220"
                  height="220"
                  style={{ borderRadius: '4px' }}
                />
              </div>

              <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                Point camera to scan or share directly
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button
                className="btn btn-secondary"
                onClick={() => handleCopyLink(qrModalLink.fullUrl)}
              >
                Copy URL
              </button>
              <a
                className="btn btn-primary"
                href={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrModalLink.fullUrl)}&color=09090b&bgcolor=ffffff`}
                download={`qr-${qrModalLink.slug}.png`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download PNG
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Notification ───────────────────────────────────────────── */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            <span className="toast-icon">
              {toast.type === 'success' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              )}
            </span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
