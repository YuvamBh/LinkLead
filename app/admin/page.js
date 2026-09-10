'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Chart from 'chart.js/auto';
import InlineAiContext from './components/InlineAiContext';
import { classifyLink } from '../../lib/classifier';

export default function AdminDashboard() {
  const [activeView, setActiveView] = useState('overview'); // 'overview' | 'links' | 'activity' | 'ai'
  const [activeCategory, setActiveCategory] = useState(null); // null = all categories
  const [categories, setCategories] = useState([]); // [{ name, count }]
  const [stats, setStats] = useState(null);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter in Links view
  const [searchQuery, setSearchQuery] = useState('');

  // Creation Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [destination, setDestination] = useState('');
  const [detectedCategory, setDetectedCategory] = useState(null); // auto-classified
  const [categoryOverride, setCategoryOverride] = useState(null); // user-selected override
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdResult, setCreatedResult] = useState(null);

  // QR Modal State
  const [qrModalLink, setQrModalLink] = useState(null);

  // Toast State
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  // AI State
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState([]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(null);
  const [slugSuggestions, setSlugSuggestions] = useState([]);
  const [slugSuggestLoading, setSlugSuggestLoading] = useState(false);
  const aiChatEndRef = useRef(null);

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

  const fetchData = useCallback(async (cat) => {
    try {
      const params = new URLSearchParams();
      if (cat) params.set('category', cat);
      const [statsRes, linksRes, catsRes] = await Promise.all([
        fetch(`/api/admin/clicks?${params}`, { cache: 'no-store' }),
        fetch('/api/admin/links', { cache: 'no-store' }),
        fetch('/api/admin/categories', { cache: 'no-store' }),
      ]);
      const statsData = await statsRes.json();
      const linksData = await linksRes.json();
      const catsData = await catsRes.json();
      setStats(statsData);
      setLinks(linksData.links || []);
      setCategories(catsData.categories || []);
    } catch (err) {
      console.error('Failed to sync telemetry:', err);
    }
    setLoading(false);
  }, []); // stable — no closed-over state

  // Single effect: fetch on mount and whenever category changes
  useEffect(() => {
    fetchData(activeCategory);
    const interval = setInterval(() => fetchData(activeCategory), 10000);
    return () => clearInterval(interval);
  }, [fetchData, activeCategory]);

  // Check AI availability on mount
  useEffect(() => {
    fetch('/api/ai/chat', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => setAiAvailable(data.aiAvailable))
      .catch(() => setAiAvailable(false));
  }, []);

  // Fetch AI analysis when switching to AI tab
  useEffect(() => {
    if (activeView.startsWith('ai') && !aiAnalysis && !aiLoading) {
      setAiLoading(true);
      fetch('/api/ai/analysis', { cache: 'no-store' })
        .then(res => res.json())
        .then(data => setAiAnalysis(data))
        .catch(err => console.error('AI analysis fetch error:', err))
        .finally(() => setAiLoading(false));
    }
  }, [activeView, aiAnalysis, aiLoading]);

  // Auto-scroll chat
  useEffect(() => {
    if (aiChatEndRef.current) {
      aiChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiChatMessages]);

  // AI Chat handler
  const handleAiChat = async (messageOverride) => {
    const message = messageOverride || aiChatInput.trim();
    if (!message || aiChatLoading) return;

    const newMessages = [...aiChatMessages, { role: 'user', content: message }];
    setAiChatMessages(newMessages);
    setAiChatInput('');
    setAiChatLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: newMessages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setAiChatMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else if (data.error) {
        setAiChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      }
    } catch {
      setAiChatMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    }
    setAiChatLoading(false);
  };

  // Smart slug suggest handler
  const handleSlugSuggest = async () => {
    if (!destination.trim() || slugSuggestLoading) return;
    setSlugSuggestLoading(true);
    setSlugSuggestions([]);
    try {
      const res = await fetch('/api/ai/slug-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: destination.trim() }),
      });
      const data = await res.json();
      setSlugSuggestions(data.slugs || []);
    } catch {
      setSlugSuggestions([]);
    }
    setSlugSuggestLoading(false);
  };

  // Auto-classify destination URL as user types
  useEffect(() => {
    if (!destination.trim()) {
      setDetectedCategory(null);
      return;
    }
    try {
      const cleanDest = destination.startsWith('http') ? destination : `https://${destination}`;
      const result = classifyLink(cleanDest);
      setDetectedCategory(result);
    } catch {
      setDetectedCategory(null);
    }
  }, [destination]);

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
    const finalCategory = categoryOverride || detectedCategory?.category || undefined;
    const finalLabel = linkLabel.trim() || undefined;

    try {
      const res = await fetch('/api/admin/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: cleanSlug,
          destination: cleanDestination,
          category: finalCategory,
          label: finalLabel,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        const fullShortUrl = `${window.location.origin}/${data.link.slug}`;
        setCreatedResult({ slug: data.link.slug, fullUrl: fullShortUrl, category: data.link.category });
        setSlug('');
        setDestination('');
        setLinkLabel('');
        setDetectedCategory(null);
        setCategoryOverride(null);
        setShowCategoryPicker(false);
        fetchData(activeCategory);
        showToast(`/${data.link.slug} created — categorized as ${data.link.category}`);
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
        fetchData(activeCategory);
        showToast('Delete failed. Please retry.', 'error');
      } else {
        fetchData(activeCategory);
        showToast(`/${linkSlug} deleted`);
      }
    } catch {
      fetchData(activeCategory);
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

  // Filtered links based on search query and active category
  const filteredLinks = useMemo(() => {
    let result = links;
    if (activeCategory) {
      result = result.filter(l => (l.category || 'Other') === activeCategory);
    }
    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(
      (l) => l.slug.toLowerCase().includes(q) || (l.destination && l.destination.toLowerCase().includes(q))
    );
  }, [links, searchQuery, activeCategory]);

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
      {/* ── Left Sidebar ──────────────────────────────────────────────────────── */}
      <nav className="left-sidebar">
        {/* Project Header */}
        <div className="sidebar-project-header">
          <div className="left-sidebar-logo">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <div className="sidebar-project-info">
            <span className="sidebar-project-name">LinkLeadApp</span>
            <span className="sidebar-project-badge">Production</span>
          </div>
        </div>

        {/* Primary Action */}
        <button
          className="sidebar-new-link-btn"
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
          New Link
        </button>

        <div className="left-sidebar-nav">
          {/* Core Section */}
          <div className="sidebar-nav-section">
            <span className="sidebar-section-title">Core</span>
            <button className={`sidebar-nav-item ${activeView === 'overview' ? 'active' : ''}`} onClick={() => setActiveView('overview')} title="Overview">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              <span>Overview</span>
            </button>
            <button className={`sidebar-nav-item ${activeView === 'links' ? 'active' : ''}`} onClick={() => setActiveView('links')} title="Links">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="9" y1="21" x2="9" y2="9"/>
              </svg>
              <span>Links</span>
            </button>
            <button className={`sidebar-nav-item ${activeView === 'activity' ? 'active' : ''}`} onClick={() => setActiveView('activity')} title="Live Stream">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              <span>Activity</span>
            </button>
          </div>

          {/* AI Intelligence Section */}
          <div className="sidebar-nav-section">
            <span className="sidebar-section-title">AI Intelligence</span>
            <button className={`sidebar-nav-item ${activeView === 'ai-opportunity' ? 'active' : ''}`} onClick={() => setActiveView('ai-opportunity')} title="Opportunity">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>Opportunity Forecast</span>
            </button>
            <button className={`sidebar-nav-item ${activeView === 'ai-audience' ? 'active' : ''}`} onClick={() => setActiveView('ai-audience')} title="Audience">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span>Audience Profile</span>
            </button>
            <button className={`sidebar-nav-item ${activeView === 'ai-performance' ? 'active' : ''}`} onClick={() => setActiveView('ai-performance')} title="Performance">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>Link Performance</span>
            </button>
            <button className={`sidebar-nav-item ${activeView === 'ai-network' ? 'active' : ''}`} onClick={() => setActiveView('ai-network')} title="Network">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
              </svg>
              <span>Network & Platforms</span>
            </button>
          </div>
        </div>

        <div className="sidebar-spacer" />
        
        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <button className="sidebar-nav-item" onClick={handleExport} title="Download CSV report" style={{ flex: 1, justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button className="sidebar-nav-item" onClick={handleLogout} title="Sign Out" style={{ flex: 1, justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </nav>

      <div className="main-content-wrapper">

        {/* ── Category Tabs ─────────────────────────────────────────────────── */}
        {categories.length > 0 && (
          <div className="category-tabs-bar">
            <button
              className={`category-tab ${!activeCategory ? 'active' : ''}`}
              onClick={() => setActiveCategory(null)}
            >
              All
              <span className="category-tab-count">{links.length}</span>
            </button>
            {categories.map(cat => (
              <button
                key={cat.name}
                className={`category-tab ${activeCategory === cat.name ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.name)}
              >
                {cat.name}
                <span className="category-tab-count">{cat.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Main View Content ────────────────────────────────────────────── */}
      <main className="main-container">

        {/* ── Inline AI Context ────────────────────────────────────────────── */}
        <InlineAiContext
          context={{
            page: activeCategory ? 'category' : 'dashboard',
            category: activeCategory || undefined,
          }}
        />

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
                      <th>Category</th>
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
                              {link.label && (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                                  {link.label}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            {link.category && (
                              <span className={`category-badge ${link.category.toLowerCase()}`}>
                                {link.category}
                              </span>
                            )}
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
                          <span className="chip">
                            {click.device} · {click.os}{click.osVersion ? ` ${click.osVersion}` : ''}
                          </span>
                          <span className="chip">
                            {click.browser}{click.browserVersion ? ` ${click.browserVersion.split('.')[0]}` : ''}
                          </span>
                          <span className="chip">
                            via {click.referrer || 'Direct'}
                          </span>
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
                  <div className="empty-state-title">Listening for incoming clicks</div>
                  <p className="empty-state-desc">
                    When visitors click your tracking links, rich metadata will stream in here in real-time.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

                {/* ════════════ AI INTELLIGENCE VIEWS ════════════ */}
        {activeView.startsWith('ai') && (
          <>
            {aiLoading ? (
              <div className="ai-loading-state">
                <div className="loading-spinner-ring" />
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Computing analytics intelligence...</span>
              </div>
            ) : aiAnalysis ? (
              <>
                {/* ── AI OPPORTUNITY VIEW ── */}
                {activeView === 'ai-opportunity' && (
                  <>
                    {/* Top Row: Score + Trend + Time */}
                    <div className="ai-top-grid">
                      {/* Opportunity Score Ring */}
                      <div className="surface-card ai-score-card">
                        <div className="card-header-bar">
                          <span className="card-heading">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/>
                              <polyline points="12 6 12 12 16 14"/>
                            </svg>
                            Opportunity Score
                          </span>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: '11px', padding: '4px 8px', height: 'auto' }}
                            onClick={() => { setAiAnalysis(null); setAiLoading(false); }}
                          >
                            ↻ Refresh
                          </button>
                        </div>
                        <div className="ai-score-body">
                          <div className="ai-score-ring-container">
                            <svg className="ai-score-ring" viewBox="0 0 120 120">
                              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                              <circle
                                cx="60" cy="60" r="52" fill="none"
                                stroke={aiAnalysis.opportunityScore.score >= 70 ? '#34d399' : aiAnalysis.opportunityScore.score >= 40 ? '#fbbf24' : '#f87171'}
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeDasharray={`${(aiAnalysis.opportunityScore.score / 100) * 327} 327`}
                                transform="rotate(-90 60 60)"
                                style={{ transition: 'stroke-dasharray 1s ease' }}
                              />
                            </svg>
                            <div className="ai-score-value">{aiAnalysis.opportunityScore.score}</div>
                          </div>
                          <div className="ai-score-breakdown">
                            {Object.entries(aiAnalysis.opportunityScore.breakdown).map(([key, val]) => (
                              <div key={key} className="ai-score-dimension">
                                <span className="ai-dim-label">{key === 'velocity' ? 'Velocity' : key === 'growth' ? 'Growth' : key === 'geo' ? 'Reach' : 'Sources'}</span>
                                <div className="ai-dim-bar-track">
                                  <div className="ai-dim-bar-fill" style={{ width: `${(val / 25) * 100}%` }} />
                                </div>
                                <span className="ai-dim-val">{val}/25</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Trend + Forecast */}
                      <div className="surface-card">
                        <div className="card-header-bar">
                          <span className="card-heading">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                            </svg>
                            Trend &amp; Forecast
                          </span>
                          <span className="card-heading-meta">7-day prediction</span>
                        </div>
                        <div style={{ padding: '20px' }}>
                          <div className="ai-trend-badge">
                            <span className={`ai-trend-label ${aiAnalysis.trend.direction}`}>{aiAnalysis.trend.label}</span>
                          </div>
                          <div className="ai-forecast-list">
                            {aiAnalysis.forecast.forecast.length > 0 ? (
                              <>
                                <div className="ai-forecast-header">
                                  <span>Date</span>
                                  <span>Predicted Clicks</span>
                                </div>
                                {aiAnalysis.forecast.forecast.map(f => (
                                  <div key={f.date} className="ai-forecast-row">
                                    <span>{new Date(f.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                    <span className="ai-forecast-val">{f.predicted}</span>
                                  </div>
                                ))}
                                <div className="ai-forecast-confidence">
                                  Confidence: <span className={`ai-confidence-${aiAnalysis.forecast.confidence}`}>{aiAnalysis.forecast.confidence}</span>
                                </div>
                              </>
                            ) : (
                              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Not enough data to forecast. Collect more clicks.</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Peak Times */}
                      <div className="surface-card">
                        <div className="card-header-bar">
                          <span className="card-heading">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/>
                              <polyline points="12 6 12 12 16 14"/>
                            </svg>
                            Peak Engagement
                          </span>
                        </div>
                        <div style={{ padding: '20px' }}>
                          {aiAnalysis.timePatterns.peakHour !== null ? (
                            <>
                              <div className="ai-peak-item">
                                <span className="ai-peak-label">Best Time to Post</span>
                                <span className="ai-peak-value">{aiAnalysis.timePatterns.peakHourLabel}</span>
                              </div>
                              <div className="ai-peak-item">
                                <span className="ai-peak-label">Best Day</span>
                                <span className="ai-peak-value">{aiAnalysis.timePatterns.peakDay}</span>
                              </div>
                              <div className="ai-hourly-bar-chart">
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>Hourly distribution</span>
                                <div className="ai-hourly-bars">
                                  {aiAnalysis.timePatterns.hourly.map((count, i) => {
                                    const max = Math.max(...aiAnalysis.timePatterns.hourly, 1);
                                    return (
                                      <div key={i} className="ai-hourly-bar-col" title={`${i}:00 — ${count} clicks`}>
                                        <div className="ai-hourly-bar" style={{ height: `${(count / max) * 100}%`, background: i === aiAnalysis.timePatterns.peakHour ? 'var(--accent-blue)' : 'rgba(255,255,255,0.12)' }} />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </>
                          ) : (
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No timing data yet. Share your links to discover peak engagement times.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="ai-deep-grid" style={{ marginBottom: '16px' }}>
                      {/* Engagement Velocity */}
                      <div className="surface-card">
                        <div className="card-header-bar">
                          <span className="card-heading">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                            </svg>
                            24h Velocity
                          </span>
                        </div>
                        <div style={{ padding: '20px' }}>
                          <div style={{ marginBottom: '12px' }}>
                            <span className="ai-trend-label" style={{ color: aiAnalysis.engagementVelocity.color, background: aiAnalysis.engagementVelocity.color + '18', border: `1px solid ${aiAnalysis.engagementVelocity.color}30`, fontSize: '13px', padding: '4px 10px' }}>
                              {aiAnalysis.engagementVelocity.label}
                            </span>
                          </div>
                          <div className="ai-velocity-row">
                            <div className="ai-velocity-stat">
                              <span className="ai-velocity-num">{aiAnalysis.engagementVelocity.current24h}</span>
                              <span className="ai-velocity-label">Last 24h</span>
                            </div>
                            <div className="ai-velocity-arrow">→</div>
                            <div className="ai-velocity-stat">
                              <span className="ai-velocity-num" style={{ color: 'var(--text-muted)' }}>{aiAnalysis.engagementVelocity.previous24h}</span>
                              <span className="ai-velocity-label">Prior 24h</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Content Calendar */}
                      <div className="surface-card" style={{ gridColumn: 'span 2' }}>
                        <div className="card-header-bar">
                          <span className="card-heading">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                              <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                            Posting Calendar
                          </span>
                        </div>
                        <div style={{ padding: '20px' }}>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
                            {aiAnalysis.contentCalendar.summary}
                          </p>
                          {aiAnalysis.contentCalendar.slots.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {aiAnalysis.contentCalendar.slots.map((slot, i) => (
                                <div key={i} className="ai-calendar-slot">
                                  <span style={{ fontSize: '11px' }}>{slot.label}</span>
                                  <div>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>{slot.day}</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}> at {slot.time}</span>
                                  </div>
                                  <div className="ai-calendar-strength">
                                    <div style={{ width: `${slot.strength}%`, height: '100%', background: slot.strength >= 60 ? '#34d399' : '#3b82f6', borderRadius: '99px', transition: 'width 0.6s ease' }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Get 10+ clicks to unlock your optimal posting schedule.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ── AI AUDIENCE VIEW ── */}
                {activeView === 'ai-audience' && (
                  <>
                    {/* Audience Profile */}
                    <div className="surface-card" style={{ marginBottom: '16px' }}>
                      <div className="card-header-bar">
                        <span className="card-heading">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                          </svg>
                          Audience Profile Summary
                        </span>
                      </div>
                      <div style={{ padding: '20px' }}>
                        <p className="ai-audience-summary">{aiAnalysis.audienceProfile.summary}</p>
                      </div>
                    </div>

                    <div className="ai-deep-grid" style={{ marginBottom: '16px' }}>
                      {/* Session Estimation */}
                      <div className="surface-card" style={{ gridColumn: 'span 2' }}>
                        <div className="card-header-bar">
                          <span className="card-heading">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                            Session Intelligence
                          </span>
                        </div>
                        <div style={{ padding: '20px' }}>
                          <div className="ai-session-grid">
                            <div className="ai-session-stat">
                              <span className="ai-session-num">{aiAnalysis.sessionEstimate.estimated}</span>
                              <span className="ai-session-label">Est. Sessions</span>
                            </div>
                            <div className="ai-session-stat">
                              <span className="ai-session-num">{aiAnalysis.sessionEstimate.uniqueIpCount || 0}</span>
                              <span className="ai-session-label">Unique IPs</span>
                            </div>
                            <div className="ai-session-stat">
                              <span className="ai-session-num" style={{ color: aiAnalysis.sessionEstimate.returnRate > 0 ? '#34d399' : 'var(--text-muted)' }}>{aiAnalysis.sessionEstimate.returnRate}%</span>
                              <span className="ai-session-label">Return Rate</span>
                            </div>
                          </div>
                          {aiAnalysis.sessionEstimate.avgSessionGapHours && (
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px' }}>
                              Avg return interval: {aiAnalysis.sessionEstimate.avgSessionGapHours}h
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Traffic Quality */}
                      <div className="surface-card">
                        <div className="card-header-bar">
                          <span className="card-heading">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                            Traffic Quality
                          </span>
                          <span className="card-heading-meta">{aiAnalysis.trafficQuality.label}</span>
                        </div>
                        <div style={{ padding: '16px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <span style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{aiAnalysis.trafficQuality.score}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>/100</span>
                          </div>
                          {aiAnalysis.trafficQuality.signals.map(sig => (
                            <div key={sig.label} className="ai-quality-signal">
                              <span className={`ai-quality-dot ${sig.positive ? 'positive' : 'negative'}`} />
                              <span className="ai-quality-label">{sig.label}</span>
                              <span className="ai-quality-note">{sig.note}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ── AI PERFORMANCE VIEW ── */}
                {activeView === 'ai-performance' && (
                  <>
                    {/* Link Grades */}
                    {Object.keys(aiAnalysis.linkGrades).length > 0 && (
                      <div className="surface-card" style={{ marginBottom: '16px' }}>
                        <div className="card-header-bar">
                          <span className="card-heading">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                            </svg>
                            Link Performance Grades
                          </span>
                        </div>
                        <div style={{ padding: '16px 20px' }}>
                          <div className="ai-grades-list">
                            {Object.entries(aiAnalysis.linkGrades).map(([slug, info]) => (
                              <div key={slug} className="ai-grade-row">
                                <div className="ai-grade-left">
                                  <span className="ai-grade-badge" style={{ background: info.color + '20', color: info.color, borderColor: info.color + '40' }}>{info.grade}</span>
                                  <span className="ai-grade-slug">/{slug}</span>
                                </div>
                                <div className="ai-grade-right">
                                  <span className="ai-grade-reason">{info.reason}</span>
                                  <span className="ai-grade-clicks">{info.clicks} clicks</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Lead Quality Per Link */}
                    <div className="surface-card" style={{ marginBottom: '16px' }}>
                      <div className="card-header-bar">
                        <span className="card-heading">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                          </svg>
                          Lead Quality Per Link
                        </span>
                      </div>
                      <div style={{ padding: '16px 20px' }}>
                        {Object.keys(aiAnalysis.leadQuality).length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {Object.entries(aiAnalysis.leadQuality).map(([slug, lq]) => (
                              <div key={slug} className="ai-lead-quality-row">
                                <div className="ai-lead-quality-left">
                                  <span className="ai-grade-slug">/{slug}</span>
                                  <span style={{ fontSize: '12px', fontWeight: 600, color: lq.color }}>{lq.label}</span>
                                </div>
                                <div className="ai-lead-quality-bar-track">
                                  <div className="ai-lead-quality-bar-fill" style={{ width: `${lq.score}%`, background: lq.color }} />
                                </div>
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '28px', textAlign: 'right' }}>{lq.score}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No lead quality data available yet.</p>
                        )}
                      </div>
                    </div>

                    {/* ── Link Lifecycle ── */}
                    {aiAnalysis.linkLifecycle.length > 0 && (
                      <div className="surface-card" style={{ marginBottom: '16px' }}>
                        <div className="card-header-bar">
                          <span className="card-heading">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                              <path d="M3 3v5h5"/>
                            </svg>
                            Link Lifecycle
                          </span>
                          <span className="card-heading-meta">Age &amp; decay analysis</span>
                        </div>
                        <div style={{ padding: '8px 12px' }}>
                          {aiAnalysis.linkLifecycle.map(link => (
                            <div key={link.slug} className="ai-lifecycle-row">
                              <div className="ai-lifecycle-left">
                                <span className="ai-lifecycle-dot" style={{ background: link.stageColor }} />
                                <span className="ai-grade-slug">/{link.slug}</span>
                              </div>
                              <div className="ai-lifecycle-middle">
                                <span className="ai-lifecycle-stage" style={{ color: link.stageColor }}>{link.stage.charAt(0).toUpperCase() + link.stage.slice(1)}</span>
                                <span className="ai-lifecycle-desc">{link.stageDesc}</span>
                              </div>
                              <div className="ai-lifecycle-right">
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{link.ageDays}d old · {link.clicksPerDay}/day</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Anomalies */}
                    {aiAnalysis.anomalies.length > 0 && (
                      <div className="ai-anomalies-section" style={{ marginBottom: '16px' }}>
                        {aiAnalysis.anomalies.map((a, i) => (
                          <div key={i} className={`ai-anomaly-alert ${a.type}`}>
                            <span className="ai-anomaly-icon">{a.type === 'spike' ? '+' : '-'}</span>
                            <div>
                              <strong>{a.type === 'spike' ? 'Traffic Spike' : 'Traffic Drop'}</strong> on {new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {' — '}{a.value} clicks vs {a.expected} avg ({a.magnitude}x deviation)
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tips */}
                    <div className="surface-card" style={{ marginBottom: '16px' }}>
                      <div className="card-header-bar">
                        <span className="card-heading">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18h6"/>
                            <path d="M10 22h4"/>
                            <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
                          </svg>
                          Actionable Lead Tips
                        </span>
                        <span className="card-heading-meta">{aiAnalysis.tips.length} insights</span>
                      </div>
                      <div className="ai-tips-grid">
                        {aiAnalysis.tips.map((tip, i) => (
                          <div key={i} className="ai-tip-card">
                            <div className="ai-tip-header">
                              <span className="ai-tip-icon">{tip.icon}</span>
                              <span className="ai-tip-category">{tip.category}</span>
                            </div>
                            <p className="ai-tip-text">{tip.tip}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* ── AI NETWORK VIEW ── */}
                {activeView === 'ai-network' && (
                  <>
                    <div className="ai-two-col" style={{ marginBottom: '16px' }}>
                      {/* Virality Signal */}
                      <div className="surface-card">
                        <div className="card-header-bar">
                          <span className="card-heading">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                            </svg>
                            Virality Signal
                          </span>
                          <span className={`ai-virality-badge level-${aiAnalysis.viralitySignal.level}`}>
                            {aiAnalysis.viralitySignal.level === 'high' ? 'High' : aiAnalysis.viralitySignal.level === 'medium' ? 'Medium' : aiAnalysis.viralitySignal.level === 'emerging' ? 'Emerging' : 'Low'}
                          </span>
                        </div>
                        <div style={{ padding: '20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                            <div className="ai-virality-bar-track">
                              <div className="ai-virality-bar-fill" style={{ width: `${aiAnalysis.viralitySignal.score}%` }} />
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '32px' }}>{aiAnalysis.viralitySignal.score}</span>
                          </div>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '12px' }}>
                            {aiAnalysis.viralitySignal.explanation}
                          </p>
                          {aiAnalysis.viralitySignal.indicators.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {aiAnalysis.viralitySignal.indicators.map((ind, i) => (
                                <div key={i} className="ai-virality-indicator">
                                  <span className="ai-check-icon">+</span>
                                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{ind.label}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Platform Intelligence */}
                      <div className="surface-card">
                        <div className="card-header-bar">
                          <span className="card-heading">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                              <line x1="8" y1="21" x2="16" y2="21"/>
                              <line x1="12" y1="17" x2="12" y2="21"/>
                            </svg>
                            Platform Intelligence
                          </span>
                          <span className="card-heading-meta">Confidence: {aiAnalysis.platformIntelligence.confidence}</span>
                        </div>
                        <div style={{ padding: '20px' }}>
                          {aiAnalysis.platformIntelligence.platforms.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {aiAnalysis.platformIntelligence.platforms.map(p => (
                                <div key={p.name} className="ai-platform-row">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className="ai-platform-abbr">{p.emoji}</span>
                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{p.name}</span>
                                  </div>
                                  <div className="ai-platform-bar-track">
                                    <div className="ai-platform-bar-fill" style={{ width: `${p.strength}%` }} />
                                  </div>
                                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '32px', textAlign: 'right' }}>{p.strength}%</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Not enough click data to infer platforms yet.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── B2B / Network Intelligence ── */}
                    {aiAnalysis.networkIntelligence.topISPs.length > 0 && (
                      <div className="surface-card" style={{ marginBottom: '16px' }}>
                        <div className="card-header-bar">
                          <span className="card-heading">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                            </svg>
                            Network & B2B Intelligence
                          </span>
                          <span className="card-heading-meta">
                            {aiAnalysis.networkIntelligence.b2bSignal > 30 ? 'B2B signals detected' : 'Mostly consumer traffic'}
                          </span>
                        </div>
                        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                          <div>
                            <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '12px' }}>Network Mix</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {[
                                { label: 'Corporate / B2B', pct: aiAnalysis.networkIntelligence.corporatePct, color: '#6366f1' },
                                { label: 'Mobile Carrier', pct: aiAnalysis.networkIntelligence.mobilePct, color: '#3b82f6' },
                                { label: 'Residential', pct: aiAnalysis.networkIntelligence.residentialPct, color: '#10b981' },
                              ].map(item => (
                                <div key={item.label} className="ai-network-row">
                                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '140px' }}>{item.label}</span>
                                  <div className="ai-dim-bar-track" style={{ flex: 1 }}>
                                    <div style={{ height: '100%', background: item.color, borderRadius: '99px', width: `${item.pct}%`, transition: 'width 0.6s ease' }} />
                                  </div>
                                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '32px', textAlign: 'right' }}>{item.pct}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '12px' }}>Top ISPs</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {aiAnalysis.networkIntelligence.topISPs.map(isp => (
                                <div key={isp.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                  <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>{isp.name}</span>
                                  <span style={{ color: 'var(--text-muted)' }}>{isp.count} <span style={{ color: 'var(--text-subtle)' }}>({isp.pct}%)</span></span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="ai-loading-state">
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Failed to load analysis. <button className="btn btn-ghost" onClick={() => { setAiAnalysis(null); setAiLoading(false); }}>Retry</button></p>
              </div>
            )}
          </>
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

                    {/* Auto-detect category strip */}
                    {detectedCategory && (
                      <div className="category-detect-row">
                        <span className="category-detect-label">Detected:</span>
                        {showCategoryPicker ? (
                          <select
                            className="text-input"
                            style={{ padding: '2px 8px', fontSize: '12px', height: '28px' }}
                            value={categoryOverride || detectedCategory.category}
                            onChange={e => { setCategoryOverride(e.target.value); setShowCategoryPicker(false); }}
                          >
                            {[detectedCategory.category, ...categories.map(c => c.name)]
                              .filter((v, i, a) => a.indexOf(v) === i)
                              .map(c => <option key={c} value={c}>{c}</option>)}
                            <option value="Other">Other</option>
                          </select>
                        ) : (
                          <span className="category-detect-value">
                            {categoryOverride || detectedCategory.category}
                          </span>
                        )}
                        <button
                          type="button"
                          className="category-detect-change"
                          onClick={() => setShowCategoryPicker(v => !v)}
                        >
                          {showCategoryPicker ? 'Cancel' : 'Change'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Optional label field */}
                  <div className="form-field">
                    <label className="form-label" htmlFor="link-label">
                      <span>Label</span>
                      <span className="form-label-hint">Optional — human-readable name</span>
                    </label>
                    <div className="input-container">
                      <input
                        id="link-label"
                        type="text"
                        className="text-input"
                        placeholder="e.g. Q3 User Research Survey"
                        value={linkLabel}
                        onChange={e => setLinkLabel(e.target.value)}
                        maxLength={60}
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <label className="form-label" htmlFor="custom-slug">
                      <span>Custom Slug</span>
                      <span className="form-label-hint">Alphanumeric &amp; dashes</span>
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
                      {destination.trim() && (
                        <button
                          type="button"
                          className="slug-suggest-btn"
                          onClick={handleSlugSuggest}
                          disabled={slugSuggestLoading}
                          title="AI suggest slugs"
                        >
                          {slugSuggestLoading ? (
                            <div className="loading-spinner-ring" style={{ width: '14px', height: '14px', borderWidth: '1.5px' }} />
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
                              <path d="M9 18h6"/>
                              <path d="M10 22h4"/>
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                    {slugSuggestions.length > 0 && (
                      <div className="slug-suggestions">
                        {slugSuggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="slug-suggestion-chip"
                            onClick={() => { setSlug(s); setSlugSuggestions([]); }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
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
    </div>
  );
}
