'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Chart from 'chart.js/auto';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('analytics');
  const [stats, setStats] = useState(null);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Link creator state
  const [slug, setSlug] = useState('');
  const [destination, setDestination] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [copyText, setCopyText] = useState('Copy');
  const [deletingSlug, setDeletingSlug] = useState(null);

  // Chart refs
  const lineChartRef = useRef(null);
  const donutChartRef = useRef(null);
  const lineChartInstance = useRef(null);
  const donutChartInstance = useRef(null);

  const router = useRouter();

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
      console.error('Failed to fetch data:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Render charts when stats change
  useEffect(() => {
    if (!stats || activeTab !== 'analytics') return;

    // Line chart
    if (lineChartRef.current) {
      if (lineChartInstance.current) lineChartInstance.current.destroy();

      const ctx = lineChartRef.current.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 0, 280);
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');

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
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#3b82f6',
            pointHoverBorderColor: '#fff',
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
              backgroundColor: '#1e293b',
              titleColor: '#f1f5f9',
              bodyColor: '#94a3b8',
              borderColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              padding: 12,
              cornerRadius: 8,
              displayColors: false,
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(255,255,255,0.03)' },
              ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 8 },
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(255,255,255,0.03)' },
              ticks: { color: '#64748b', font: { size: 11 }, precision: 0 },
            },
          },
        },
      });
    }

    // Donut chart
    if (donutChartRef.current) {
      if (donutChartInstance.current) donutChartInstance.current.destroy();

      const deviceData = stats.devices;
      const labels = Object.keys(deviceData).filter((k) => deviceData[k] > 0);
      const values = labels.map((k) => deviceData[k]);
      const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#64748b'];

      donutChartInstance.current = new Chart(donutChartRef.current, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: colors.slice(0, labels.length),
            borderColor: '#111827',
            borderWidth: 3,
            hoverOffset: 6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1e293b',
              titleColor: '#f1f5f9',
              bodyColor: '#94a3b8',
              borderColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              padding: 12,
              cornerRadius: 8,
            },
          },
        },
      });
    }

    return () => {
      if (lineChartInstance.current) lineChartInstance.current.destroy();
      if (donutChartInstance.current) donutChartInstance.current.destroy();
    };
  }, [stats, activeTab]);

  const handleCreateLink = async (e) => {
    e.preventDefault();
    setCreateError('');
    setGeneratedLink('');
    setCreating(true);

    try {
      const res = await fetch('/api/admin/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, destination }),
      });

      const data = await res.json();
      if (res.ok) {
        const origin = window.location.origin;
        // Clean link - just origin/slug, no /api/r/ prefix
        setGeneratedLink(`${origin}/${data.link.slug}`);
        setSlug('');
        setDestination('');
        fetchData();
      } else {
        setCreateError(data.error || 'Failed to create link');
      }
    } catch {
      setCreateError('Connection error');
    }

    setCreating(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopyText('Copied!');
      setTimeout(() => setCopyText('Copy'), 2000);
    } catch {
      setCopyText('Failed');
    }
  };

  const handleDeleteLink = async (linkSlug) => {
    if (!confirm(`Delete /${linkSlug}? All click data for this link will remain in analytics.`)) return;

    // Optimistic UI update - remove instantly from local state
    setDeletingSlug(linkSlug);
    setLinks((prev) => prev.filter((l) => l.slug !== linkSlug));

    try {
      const res = await fetch(`/api/admin/links?slug=${encodeURIComponent(linkSlug)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        // Revert if server says failure
        fetchData();
        alert('Delete failed - please try again');
      } else {
        // Refresh to ensure consistency
        fetchData();
      }
    } catch {
      fetchData();
      alert('Delete failed - please try again');
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

  const timeAgo = (timestamp) => {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (loading) {
    return (
      <div className="loading-wrapper">
        <div className="loading-spinner" />
      </div>
    );
  }

  const topCountry = stats?.countries?.[0]?.name || 'N/A';
  const mobilePercent = stats?.totalClicks > 0
    ? Math.round(((stats.devices.Mobile || 0) / stats.totalClicks) * 100)
    : 0;

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-inner">
          <div className="header-left">
            <div className="header-logo-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <span className="header-logo-text">LinkLead</span>
          </div>
          <div className="header-right">
            <button className="btn-ghost" onClick={handleExport}>
              Export CSV
            </button>
            <button className="btn-danger" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics
        </button>
        <button
          className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
          onClick={() => setActiveTab('create')}
        >
          Create Link
        </button>
      </div>

      <main className="dashboard-content">

        {/* ════════ Analytics Tab ════════ */}
        {activeTab === 'analytics' && (
          <>
            {/* Stats Cards */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon-svg">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                </div>
                <div className="stat-value">{stats?.totalClicks?.toLocaleString() || 0}</div>
                <div className="stat-label">Total Clicks</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon-svg">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                </div>
                <div className="stat-value">{stats?.totalLinks || 0}</div>
                <div className="stat-label">Active Links</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon-svg">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                </div>
                <div className="stat-value" style={{ fontSize: topCountry.length > 10 ? '18px' : '32px' }}>
                  {topCountry}
                </div>
                <div className="stat-label">Top Country</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon-svg">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                    <line x1="12" y1="18" x2="12.01" y2="18"/>
                  </svg>
                </div>
                <div className="stat-value">{mobilePercent}%</div>
                <div className="stat-label">Mobile Traffic</div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="charts-row">
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Click Trends - Last 30 Days</span>
                </div>
                <div className="card-body">
                  <div className="chart-container">
                    <canvas ref={lineChartRef} />
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-title">Device Breakdown</span>
                </div>
                <div className="card-body">
                  <div className="chart-container" style={{ height: '200px' }}>
                    <canvas ref={donutChartRef} />
                  </div>
                  <div className="donut-legend">
                    {Object.entries(stats?.devices || {})
                      .filter(([, v]) => v > 0)
                      .map(([name, count], i) => {
                        const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#64748b'];
                        return (
                          <div key={name} className="donut-legend-item">
                            <span className="donut-legend-color" style={{ background: colors[i] }} />
                            <span>{name}</span>
                            <span className="donut-legend-value">{count}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>

            {/* Breakdown Grid */}
            <div className="breakdown-grid">
              {/* Countries */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Top Countries</span>
                </div>
                <div className="card-body">
                  {stats?.countries?.length > 0 ? (
                    stats.countries.map((item) => (
                      <div key={item.name} className="bar-row">
                        <span className="bar-label">{item.name}</span>
                        <div className="bar-indicator" style={{ flex: 1 }}>
                          <div className="bar-track">
                            <div
                              className="bar-fill"
                              style={{ width: `${(item.count / stats.countries[0].count) * 100}%` }}
                            />
                          </div>
                          <span className="bar-value">{item.count}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <p className="empty-state-text">No geographic data yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Referrers */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Traffic Sources</span>
                </div>
                <div className="card-body">
                  {stats?.referrers?.length > 0 ? (
                    stats.referrers.map((item) => (
                      <div key={item.name} className="bar-row">
                        <span className="bar-label">{item.name}</span>
                        <div className="bar-indicator" style={{ flex: 1 }}>
                          <div className="bar-track">
                            <div
                              className="bar-fill"
                              style={{
                                width: `${(item.count / stats.referrers[0].count) * 100}%`,
                                background: 'linear-gradient(90deg, #10b981, #06b6d4)',
                              }}
                            />
                          </div>
                          <span className="bar-value">{item.count}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <p className="empty-state-text">No referrer data yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Browsers */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Browsers</span>
                </div>
                <div className="card-body">
                  {stats?.browsers?.length > 0 ? (
                    stats.browsers.map((item) => (
                      <div key={item.name} className="bar-row">
                        <span className="bar-label">{item.name}</span>
                        <div className="bar-indicator" style={{ flex: 1 }}>
                          <div className="bar-track">
                            <div
                              className="bar-fill"
                              style={{
                                width: `${(item.count / stats.browsers[0].count) * 100}%`,
                                background: 'linear-gradient(90deg, #f59e0b, #f43f5e)',
                              }}
                            />
                          </div>
                          <span className="bar-value">{item.count}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <p className="empty-state-text">No browser data yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Top Links Table */}
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <span className="card-title">Top Performing Links</span>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                {stats?.topLinks?.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Slug</th>
                        <th>Destination</th>
                        <th>Clicks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.topLinks.map((link) => (
                        <tr key={link.slug}>
                          <td>
                            <a href={`/admin/links/${link.slug}`} className="slug-link">
                              /{link.slug}
                            </a>
                          </td>
                          <td className="destination-cell">{link.destination}</td>
                          <td>
                            <span className="click-count">{link.count}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">
                    <p className="empty-state-text">Create your first link to start tracking</p>
                  </div>
                )}
              </div>
            </div>

            {/* Live Feed */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Live Click Feed</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Auto-refreshes every 10s</span>
              </div>
              <div className="card-body" style={{ padding: '8px' }}>
                {stats?.recentClicks?.length > 0 ? (
                  <div className="live-feed">
                    {stats.recentClicks.map((click) => (
                      <div key={click.id} className="feed-item">
                        <div className="feed-dot" />
                        <div className="feed-content">
                          <div className="feed-main">
                            <strong>
                              {click.city && click.city !== 'Unknown'
                                ? `${click.city}, ${click.country}`
                                : click.country !== 'Unknown'
                                ? click.country
                                : 'Unknown Location'}
                            </strong>
                            {' - '}
                            <a href={`/admin/links/${click.slug}`} className="slug-link">
                              /{click.slug}
                            </a>
                          </div>
                          <div className="feed-meta">
                            <span className="feed-tag">{timeAgo(click.timestamp)}</span>
                            <span className="feed-tag">{click.device} · {click.os}{click.osVersion ? ` ${click.osVersion}` : ''}</span>
                            <span className="feed-tag">{click.browser}{click.browserVersion ? ` ${click.browserVersion.split('.')[0]}` : ''}</span>
                            <span className="feed-tag">{click.referrer}</span>
                            {click.lat != null && (
                              <span className="feed-tag feed-tag-geo">
                                {click.lat.toFixed(3)}, {click.lon.toFixed(3)}
                              </span>
                            )}
                            {click.isp && (
                              <span className="feed-tag">{click.isp}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <p className="empty-state-text">Clicks will appear here in real-time</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ════════ Create Link Tab ════════ */}
        {activeTab === 'create' && (
          <div className="link-creator">
            <h2 className="link-creator-title">Create a Tracking Link</h2>
            <p className="link-creator-subtitle">
              Generate a short link that tracks every click with full analytics - device, location, browser, and referrer source.
            </p>

            <form className="creator-form" onSubmit={handleCreateLink}>
              <div className="input-group">
                <label htmlFor="destination">Destination URL</label>
                <input
                  id="destination"
                  type="url"
                  className="input-field"
                  placeholder="https://example.com/your-page"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="slug">Custom Slug</label>
                <input
                  id="slug"
                  type="text"
                  className="input-field"
                  placeholder="e.g. sale2026, product-launch"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  required
                />
              </div>

              {createError && <p className="login-error">{createError}</p>}

              <button type="submit" className="btn-primary" disabled={creating}>
                {creating ? 'Generating...' : 'Generate Tracking Link'}
              </button>
            </form>

            {generatedLink && (
              <div className="generated-link">
                <div className="generated-link-label">Your tracking link is ready - share this URL</div>
                <div className="generated-link-url">
                  <code>{generatedLink}</code>
                  <button className="btn-copy" onClick={handleCopy}>
                    {copyText}
                  </button>
                </div>
              </div>
            )}

            {/* Existing Links */}
            {links.length > 0 && (
              <div className="links-list">
                <h3 className="links-list-title">Your Links ({links.length})</h3>
                <div className="card">
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Slug</th>
                          <th>Destination</th>
                          <th>Created</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {links.map((link) => (
                          <tr key={link.slug} style={{ opacity: deletingSlug === link.slug ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                            <td>
                              <a href={`/admin/links/${link.slug}`} className="slug-link">
                                /{link.slug}
                              </a>
                            </td>
                            <td className="destination-cell">{link.destination}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                              {new Date(link.createdAt).toLocaleDateString()}
                            </td>
                            <td>
                              <button
                                className="btn-delete"
                                onClick={() => handleDeleteLink(link.slug)}
                                disabled={deletingSlug === link.slug}
                                title="Delete link"
                              >
                                {deletingSlug === link.slug ? '...' : 'Delete'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
