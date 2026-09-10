'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * AiSidebar — Permanent glassmorphic AI panel on the right.
 * Always visible. Context-aware per page/link/category.
 * Props: context: { page, slug?, category?, link? }
 */
export default function AiSidebar({ context }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('ai-sidebar-collapsed') === 'true';
  });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const quickPrompts = buildQuickPrompts(context);

  useEffect(() => {
    localStorage.setItem('ai-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    fetch('/api/ai/chat')
      .then(r => r.json())
      .then(d => setAiAvailable(d.aiAvailable))
      .catch(() => setAiAvailable(false));
  }, []);

  // Reset chat when context changes (navigating between links/categories)
  useEffect(() => {
    setMessages([]);
  }, [context?.slug, context?.category, context?.page]);

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          context: {
            page: context?.page || 'dashboard',
            slug: context?.slug || null,
            category: context?.category || null,
          },
          history: messages.slice(-8),
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || `Error: ${data.error}`,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Connection error. Please try again.',
      }]);
    }
    setLoading(false);
  }, [input, loading, messages, context]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const contextLabel = getContextLabel(context);

  if (collapsed) {
    return (
      <div className="ai-rail-collapsed" onClick={() => setCollapsed(false)} title="Open AI Advisor">
        <div className="ai-rail-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.27A7 7 0 0 1 14 23h-4a7 7 0 0 1-6.73-5H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
          </svg>
        </div>
        <span className="ai-rail-label">AI</span>
      </div>
    );
  }

  return (
    <aside className="ai-panel">
      {/* ── Header ── */}
      <div className="ai-panel-header">
        <div className="ai-panel-header-left">
          <div className="ai-panel-avatar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.27A7 7 0 0 1 14 23h-4a7 7 0 0 1-6.73-5H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
            </svg>
          </div>
          <div>
            <p className="ai-panel-title">AI Advisor</p>
            <p className="ai-panel-context">{contextLabel}</p>
          </div>
        </div>
        <div className="ai-panel-header-actions">
          {messages.length > 0 && (
            <button
              className="ai-panel-action-btn"
              onClick={() => setMessages([])}
              title="New conversation"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
          <button
            className="ai-panel-action-btn"
            onClick={() => setCollapsed(true)}
            title="Collapse"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="ai-panel-body">
        {messages.length === 0 ? (
          <div className="ai-panel-welcome">
            <p className="ai-panel-welcome-sub">
              {aiAvailable === false
                ? 'Local analysis mode — add OPENAI_API_KEY for full AI.'
                : `Analyzing ${contextLabel.toLowerCase()}. Ask me anything.`}
            </p>

            <div className="ai-panel-prompts-label">Suggested</div>
            <div className="ai-panel-prompts">
              {quickPrompts.map((p, i) => (
                <button
                  key={i}
                  className="ai-panel-prompt-chip"
                  onClick={() => sendMessage(p)}
                  disabled={aiAvailable === false}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="ai-panel-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`ai-msg ai-msg--${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="ai-msg-dot" />
                )}
                <div className="ai-msg-bubble">
                  <MarkdownText content={msg.content} />
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-msg ai-msg--assistant">
                <div className="ai-msg-dot" />
                <div className="ai-msg-bubble">
                  <div className="ai-typing">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input ── */}
      <div className="ai-panel-footer">
        <div className="ai-panel-input-wrap">
          <textarea
            ref={inputRef}
            className="ai-panel-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={aiAvailable === false ? 'Requires OPENAI_API_KEY…' : 'Message AI Advisor…'}
            disabled={aiAvailable === false || loading}
            rows={1}
          />
          <button
            className="ai-panel-send"
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading || aiAvailable === false}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>
        <p className="ai-panel-footer-note">
          {aiAvailable ? 'Powered by GPT-4o · context-aware' : 'Local analysis only'}
        </p>
      </div>
    </aside>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getContextLabel(context) {
  if (!context) return 'All Links';
  if (context.page === 'link' && context.slug) {
    return context.link?.label || `/${context.slug}`;
  }
  if (context.page === 'category' && context.category) return context.category;
  return 'All Links';
}

function buildQuickPrompts(context) {
  if (context?.page === 'link') {
    return [
      'How is this link performing?',
      'What time gets the most clicks?',
      'How do I get more traffic to this link?',
      'Is this trending up or down?',
    ];
  }
  if (context?.page === 'category') {
    return [
      `How is my ${context.category} category doing?`,
      'Which link here gets the most traffic?',
      'When should I share these links?',
      'Any anomalies or spikes?',
    ];
  }
  return [
    'What is my best performing link?',
    'Which category gets the most traffic?',
    'Any unusual spikes this week?',
    'How can I generate more leads?',
  ];
}

function MarkdownText({ content }) {
  if (!content) return null;
  const lines = content.split('\n');
  return (
    <div className="ai-md">
      {lines.map((line, i) => {
        const html = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
          return (
            <div key={i} className="ai-md-li"
              dangerouslySetInnerHTML={{ __html: '· ' + html.replace(/^[-•]\s*/, '') }}
            />
          );
        }
        if (line.trim() === '') return <div key={i} style={{ height: '4px' }} />;
        return <div key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}
