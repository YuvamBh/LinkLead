'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * InlineAiContext — A bottom-centered floating AI console.
 * Props: context: { page, slug?, category?, link? }
 */
export default function InlineAiContext({ context }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const quickPrompts = buildQuickPrompts(context);
  const contextLabel = getContextLabel(context);

  // Check AI availability
  useEffect(() => {
    fetch('/api/ai/chat')
      .then(r => r.json())
      .then(d => setAiAvailable(d.aiAvailable))
      .catch(() => setAiAvailable(false));
  }, []);

  // Reset when context changes
  useEffect(() => {
    setMessages([]);
    setOpen(false);
  }, [context?.slug, context?.category, context?.page]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close on Escape or click outside
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e) => {
      if (!e.target.closest('.ai-bottom-container')) setOpen(false);
    };
    if (open) {
      window.addEventListener('keydown', onKey);
      window.addEventListener('click', onClick);
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [open]);

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    if (!open) setOpen(true);
    
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
  }, [input, loading, messages, context, open]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="ai-bottom-container">
      
      {/* ── Chat Window (Appears above input) ── */}
      {open && (
        <div className="ai-bottom-chat">
          <div className="ai-bottom-header">
            <div className="ai-bottom-header-left">
              <span className="ai-bottom-title">AI Advisor</span>
              <span className="ai-bottom-ctx">{contextLabel}</span>
            </div>
            <div className="ai-bottom-header-right">
              {messages.length > 0 && (
                <button className="ai-bottom-icon-btn" onClick={() => setMessages([])} title="Clear chat">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                  </svg>
                </button>
              )}
              <button className="ai-bottom-icon-btn" onClick={() => setOpen(false)} title="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          <div className="ai-bottom-body">
            {messages.length === 0 ? (
              <div className="ai-bottom-welcome">
                <p className="ai-bottom-welcome-text">
                  {aiAvailable === false
                    ? 'Add an OPENAI_API_KEY to enable AI chat.'
                    : `Analyzing ${contextLabel}. Ask me anything.`}
                </p>
                <div className="ai-bottom-chips">
                  {quickPrompts.map((p, i) => (
                    <button
                      key={i}
                      className="ai-bottom-chip"
                      onClick={() => sendMessage(p)}
                      disabled={aiAvailable === false}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="ai-bottom-messages">
                {messages.map((msg, i) => (
                  <div key={i} className={`ai-msg ai-msg--${msg.role}`}>
                    {msg.role === 'assistant' && <div className="ai-msg-dot" />}
                    <div className="ai-msg-bubble">
                      <MarkdownText content={msg.content} />
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="ai-msg ai-msg--assistant">
                    <div className="ai-msg-dot" />
                    <div className="ai-msg-bubble">
                      <div className="iai-typing"><span/><span/><span/></div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Input Pill (Always fixed at bottom) ── */}
      <div className="ai-bottom-input-wrap">
        <textarea
          ref={inputRef}
          className="ai-bottom-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => { if (!open) setOpen(true); }}
          placeholder={aiAvailable === false ? 'Requires OPENAI_API_KEY…' : `Ask anything about ${contextLabel}...`}
          disabled={aiAvailable === false}
          rows={1}
        />
        <button
          className="ai-bottom-send"
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading || aiAvailable === false}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>

    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getContextLabel(context) {
  if (!context) return 'your dashboard';
  if (context.page === 'link' && context.slug) return context.link?.label || `/${context.slug}`;
  if (context.page === 'category' && context.category) return context.category;
  return 'your dashboard';
}

function buildQuickPrompts(context) {
  if (context?.page === 'link') {
    return ['How is this link performing?', 'What time gets the most clicks?', 'How do I get more traffic?', 'Is this trending up or down?'];
  }
  if (context?.page === 'category') {
    return [`How is ${context.category} performing?`, 'Which link gets the most traffic?', 'When should I share these?', 'Any anomalies or spikes?'];
  }
  return ['What is my best performing link?', 'Which category gets the most traffic?', 'Any unusual spikes this week?', 'How can I generate more leads?'];
}

function MarkdownText({ content }) {
  if (!content) return null;
  return (
    <div className="ai-md">
      {content.split('\n').map((line, i) => {
        const html = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
          return <div key={i} className="ai-md-li" dangerouslySetInnerHTML={{ __html: '· ' + html.replace(/^[-•]\s*/, '') }} />;
        }
        if (line.trim() === '') return <div key={i} style={{ height: '4px' }} />;
        return <div key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}
