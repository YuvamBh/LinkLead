'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Chart from 'chart.js/auto';

export default function LinkAnalyticsPage() {
  const params = useParams();
  const linkSlug = params.slug;

  const [stats, setStats] = useState(null);
  const [linkInfo, setLinkInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const lineChartRef = useRef(null);
  const donutChartRef = useRef(null);
  const lineChartInstance = useRef(null);
  const donutChartInstance = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, linksRes] = await Promise.all([
        fetch(`/api/admin/clicks?slug=${linkSlug}`),
        fetch('/api/admin/links'),
      ]);
      const statsData = await statsRes.json();
      const linksData = await linksRes.json();
      setStats(statsData);
      const info = (linksData.links || []).find((l) => l.slug === linkSlug);
      setLinkInfo(info || null);
    } catch (err) {
      console.error('Failed to fetch:', err);
    }
    setLoading(false);
  }, [linkSlug]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Charts
  useEffect(() => {
    if (!stats) return;

    if (lineChartRef.current) {
      if (lineChartInstance.current) lineChartInstance.current.destroy();
      const ctx = lineChartRef.current.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 0, 280);
      gradient.addColorStop(0, 'rgba(139, 92, 246, 0.25)');
      gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');

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
            borderColor: '#8b5cf6',
            backgroundColor: gradient,
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#8b5cf6',
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
  }, [stats]);

  const handleExport = () => {
    window.open(`/api/admin/export?slug=${linkSlug}`, '_blank');
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

  const mobilePercent = stats?.totalClicks > 0
    ? Math.round(((stats.devices.Mobile || 0) / stats.totalClicks) * 100)
    : 0;

  return (
    <div className="dashboard">
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
          </div>
        </div>
      </header>

      <main className="dashboard-content">
        <a href="/admin" className="back-link">← Back to Dashboard</a>

        <div className="slug-title">
          <code>/{linkSlug}</code>
        </div>
        {linkInfo && (
          <p className="slug-destination">
            → <a href={linkInfo.destination} target="_blank" rel="noopener noreferrer">{linkInfo.destination}</a>
          </p>
        )}

        {/* Stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-icon-svg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
            <div className="stat-value">{stats?.totalClicks?.toLocaleString() || 0}</div>
            <div className="stat-label">Total Clicks</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon-svg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
            <div className="stat-value" style={{ fontSize: (stats?.countries?.[0]?.name || '').length > 10 ? '20px' : '32px' }}>
              {stats?.countries?.[0]?.name || 'N/A'}
            </div>
            <div className="stat-label">Top Country</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon-svg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                <line x1="12" y1="18" x2="12.01" y2="18"/>
              </svg>
            </div>
            <div className="stat-value">{mobilePercent}%</div>
            <div className="stat-label">Mobile Traffic</div>
          </div>
        </div>

        {/* Charts */}
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

        {/* Breakdowns */}
        <div className="breakdown-grid">
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
                        <div className="bar-fill" style={{ width: `${(item.count / stats.countries[0].count) * 100}%` }} />
                      </div>
                      <span className="bar-value">{item.count}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <p className="empty-state-text">No data yet</p>
                </div>
              )}
            </div>
          </div>
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
                        <div className="bar-fill" style={{ width: `${(item.count / stats.referrers[0].count) * 100}%`, background: 'linear-gradient(90deg, #10b981, #06b6d4)' }} />
                      </div>
                      <span className="bar-value">{item.count}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <p className="empty-state-text">No data yet</p>
                </div>
              )}
            </div>
          </div>
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
                        <div className="bar-fill" style={{ width: `${(item.count / stats.browsers[0].count) * 100}%`, background: 'linear-gradient(90deg, #f59e0b, #f43f5e)' }} />
                      </div>
                      <span className="bar-value">{item.count}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <p className="empty-state-text">No data yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Click History Feed */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Click History</span>
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
                            : click.country !== 'Unknown' ? click.country : 'Unknown Location'}
                        </strong>
                      </div>
                      <div className="feed-meta">
                        <span className="feed-tag">{timeAgo(click.timestamp)}</span>
                        <span className="feed-tag">{click.device} · {click.os}{click.osVersion ? ` ${click.osVersion}` : ''}</span>
                        <span className="feed-tag">{click.browser}{click.browserVersion ? ` ${click.browserVersion.split('.')[0]}` : ''}</span>
                        <span className="feed-tag">{click.referrer}</span>
                        {click.lat != null && (
                          <span className="feed-tag feed-tag-geo">{click.lat.toFixed(3)}, {click.lon.toFixed(3)}</span>
                        )}
                        {click.isp && <span className="feed-tag">{click.isp}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p className="empty-state-text">No clicks recorded yet for this link</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
