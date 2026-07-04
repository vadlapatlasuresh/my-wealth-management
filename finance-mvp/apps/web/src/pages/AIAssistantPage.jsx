import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../api';
import LastRefreshed from "../components/LastRefreshed";
import Disclaimer from "../components/Disclaimer";

/* Portfolio scopes the user can toggle — tells the assistant which slice of
   their finances to weigh. We send the labels in a directive prefix. */
const SCOPES = [
  { key: 'net_worth', label: 'Net worth', icon: 'ti ti-chart-pie' },
  { key: 'cash', label: 'Cash & accounts', icon: 'ti ti-wallet' },
  { key: 'investments', label: 'Investments', icon: 'ti ti-trending-up' },
  { key: 'real_estate', label: 'Real estate', icon: 'ti ti-home' },
  { key: 'business', label: 'Business', icon: 'ti ti-building-store' },
  { key: 'debt', label: 'Debt', icon: 'ti ti-credit-card' },
  { key: 'budget', label: 'Budget', icon: 'ti ti-receipt' },
  { key: 'transactions', label: 'Transactions', icon: 'ti ti-arrows-exchange' },
];

const STYLES = ['Concise', 'Balanced', 'Detailed'];

/* AI models the user can pick. "Auto" lets the backend router choose the best model per
   question (weighing cost, complexity, speed, and availability). Switching models mid-chat
   preserves the conversation — history is sent with every turn regardless of model. */
const MODELS = [
  { key: 'auto', label: 'Auto', menu: 'Auto Mode — best model per question', icon: 'ti ti-wand' },
  { key: 'claude', label: 'Claude', menu: 'Claude (Anthropic)', icon: 'ti ti-sparkles' },
  { key: 'gemini', label: 'Gemini', menu: 'Gemini (Google)', icon: 'ti ti-diamond' },
  { key: 'chatgpt', label: 'ChatGPT', menu: 'ChatGPT (OpenAI)', icon: 'ti ti-message-2' },
];

/* Prompt library grouped by capability — shown in the empty state. */
const PROMPT_LIBRARY = [
  { cat: 'Spending', icon: 'ti ti-receipt', prompts: ['Where am I overspending?', 'How do I build a budget that sticks?'] },
  { cat: 'Debt', icon: 'ti ti-credit-card', prompts: ["What's the fastest way to pay off my debt?", 'Avalanche or snowball for me?'] },
  { cat: 'Saving', icon: 'ti ti-pig-money', prompts: ['How big should my emergency fund be?', 'How can I save more automatically?'] },
  { cat: 'Investing', icon: 'ti ti-trending-up', prompts: ['How should I diversify my portfolio?', 'Am I saving enough for retirement?'] },
  { cat: 'Credit', icon: 'ti ti-id', prompts: ['How do I improve my credit score?', 'What credit utilization should I target?'] },
  { cat: 'Planning', icon: 'ti ti-target', prompts: ['Summarize my financial health', 'Should I refinance my mortgage?'] },
];

/* Adaptive follow-up suggestions based on the selected scopes. */
function buildSuggestions(selectedKeys) {
  const out = [];
  if (selectedKeys.has('investments')) out.push('How is my portfolio diversified?');
  if (selectedKeys.has('debt')) out.push("What's the fastest way to pay off my debt?");
  if (selectedKeys.has('real_estate')) out.push('Should I refinance?');
  if (selectedKeys.has('budget')) out.push('Where am I overspending?');
  if (selectedKeys.has('cash')) out.push('How big should my emergency fund be?');
  if (selectedKeys.has('business')) out.push('How is my business cash flow trending?');
  out.push('Summarize my financial health');
  if (selectedKeys.has('net_worth')) out.push('How has my net worth changed recently?');
  return Array.from(new Set(out)).slice(0, 5);
}

function normSeverity(sev) {
  const s = (sev || '').toString().toUpperCase();
  if (s === 'ACTIONABLE') return 'ACTIONABLE';
  if (s === 'WARNING') return 'WARNING';
  return 'INFO';
}
function severityVisual(sev) {
  switch (normSeverity(sev)) {
    case 'ACTIONABLE': return { icon: 'ti ti-bolt', iconCls: 'icon-amber', badge: 'badge-amber', label: 'Actionable' };
    case 'WARNING': return { icon: 'ti ti-alert-triangle', iconCls: 'icon-red', badge: 'badge-red', label: 'Warning' };
    default: return { icon: 'ti ti-info-circle', iconCls: 'icon-blue', badge: 'badge-forest', label: 'Info' };
  }
}

/* ---- lightweight markdown: **bold**, _italic_, and "- " bullet lists ---- */
function inlineMarkup(str, keyBase) {
  const out = [];
  let rem = String(str);
  const re = /(\*\*([^*]+)\*\*|_([^_]+)_)/;
  let k = 0, m;
  while ((m = rem.match(re)) !== null) {
    const idx = m.index;
    if (idx > 0) out.push(rem.slice(0, idx));
    if (m[2] != null) out.push(<strong key={`${keyBase}-b${k++}`}>{m[2]}</strong>);
    else out.push(<em key={`${keyBase}-i${k++}`} style={{ color: 'var(--tv-text-muted)' }}>{m[3]}</em>);
    rem = rem.slice(idx + m[0].length);
  }
  if (rem) out.push(rem);
  return out;
}
function RichText({ text }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} style={{ margin: '4px 0', paddingLeft: 18 }}>
          {bullets.map((b, i) => <li key={i} style={{ marginBottom: 3 }}>{inlineMarkup(b, `b${blocks.length}-${i}`)}</li>)}
        </ul>
      );
      bullets = [];
    }
  };
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (t.startsWith('- ')) bullets.push(t.slice(2));
    else { flush(); if (t === '') blocks.push(<div key={`sp${i}`} style={{ height: 6 }} />); else blocks.push(<div key={`l${i}`}>{inlineMarkup(ln, `l${i}`)}</div>); }
  });
  flush();
  return <>{blocks}</>;
}

const fmtTime = (ts) => { try { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };

export default function AIAssistantPage({ user }) {
  const [insights, setInsights] = useState([]);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [insightsError, setInsightsError] = useState('');

  // Conversation persists across reloads.
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tv_ai_chat')) || []; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const [copiedAt, setCopiedAt] = useState(-1);
  const [listening, setListening] = useState(false);

  const [responseStyle, setResponseStyle] = useState(() => localStorage.getItem('tv_ai_style') || 'Balanced');
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('tv_ai_model') || 'auto');
  const [selectedScopes, setSelectedScopes] = useState(() => new Set(SCOPES.map((s) => s.key)));

  const selectedLabels = SCOPES.filter((s) => selectedScopes.has(s.key)).map((s) => s.label);
  const allSelected = selectedScopes.size === SCOPES.length;
  const suggestions = useMemo(() => buildSuggestions(selectedScopes), [selectedScopes]);

  const conversationRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechSupported = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  // Persist conversation + style.
  useEffect(() => { localStorage.setItem('tv_ai_chat', JSON.stringify(messages.slice(-50))); }, [messages]);
  useEffect(() => { localStorage.setItem('tv_ai_style', responseStyle); }, [responseStyle]);
  useEffect(() => { localStorage.setItem('tv_ai_model', selectedModel); }, [selectedModel]);

  const toggleScope = (key) => setSelectedScopes((prev) => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next;
  });
  const toggleSelectAll = () => setSelectedScopes((prev) => prev.size === SCOPES.length ? new Set() : new Set(SCOPES.map((s) => s.key)));

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingInsights(true); setInsightsError('');
      try {
        const data = await api.getInsights();
        const list = Array.isArray(data) ? data : (data && data.insights) || [];
        if (active) setInsights(list);
      } catch (err) { if (active) setInsightsError(err.message || 'Could not load insights.'); }
      finally { if (active) setLoadingInsights(false); }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages, sending]);

  const handleRefresh = async () => {
    setRefreshing(true); setInsightsError('');
    try {
      const data = await api.refreshInsights();
      const list = Array.isArray(data) ? data : (data && data.insights) || [];
      setInsights(list);
    } catch (err) { setInsightsError(err.message || 'Could not refresh insights.'); }
    finally { setRefreshing(false); }
  };

  // Core send. `baseMessages` lets regenerate re-run against a trimmed history.
  async function ask(text, baseMessages) {
    const q = (text ?? '').trim();
    if (!q || sending) return;
    const base = baseMessages ?? messages;
    const withUser = baseMessages ? base : [...base, { role: 'user', text: q, ts: Date.now() }];
    setMessages(withUser);
    setInput('');
    setChatError('');

    const focus = selectedLabels.length ? selectedLabels.join(', ') : 'all areas';
    const directive = `[Focus areas: ${focus}] [Style: ${responseStyle}]\n${q}`;
    const history = base.map((m) => m.text);

    setSending(true);
    try {
      const res = await api.chatWithAssistant(directive, history, selectedModel);
      const reply = (res && res.reply) || 'No response.';
      const model = (res && res.model) || null;
      setMessages((prev) => [...prev, { role: 'assistant', text: reply, model, ts: Date.now() }]);
    } catch (err) {
      setChatError(err.message || 'The assistant could not respond. Please try again.');
    } finally { setSending(false); }
  }

  const handleSend = () => ask(input);

  function regenerate() {
    if (sending) return;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    const base = messages.length && messages[messages.length - 1].role === 'assistant'
      ? messages.slice(0, -1) : messages;
    ask(lastUser.text, base);
  }

  function newChat() {
    setMessages([]); setChatError(''); setInput('');
    localStorage.removeItem('tv_ai_chat');
  }

  function copyMessage(text, idx) {
    try { navigator.clipboard?.writeText(text); setCopiedAt(idx); setTimeout(() => setCopiedAt(-1), 1500); } catch { /* ignore */ }
  }

  function setFeedback(idx, value) {
    setMessages((prev) => prev.map((m, i) => i === idx ? { ...m, feedback: m.feedback === value ? null : value } : m));
  }

  function exportChat() {
    const md = messages.map((m) => `### ${m.role === 'user' ? 'You' : 'Assistant'}\n\n${m.text}\n`).join('\n');
    const blob = new Blob([`# TerraVest AI conversation\n\n${md}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'terravest-ai-chat.md'; a.click();
    URL.revokeObjectURL(url);
  }

  function toggleVoice() {
    if (!speechSupported) return;
    if (listening) { recognitionRef.current?.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => setInput((prev) => (prev ? prev + ' ' : '') + e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec; setListening(true); rec.start();
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const lastIsAssistant = messages.length && messages[messages.length - 1].role === 'assistant';

  return (
    <div id="page-aiassistant" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">AI Assistant</div>
          <div className="page-subtitle">Personalized insights and a chat that knows your finances</div>
        </div>
        <div className="page-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <LastRefreshed onRefresh={handleRefresh} />
          <button className="btn btn-secondary btn-sm" onClick={handleRefresh} disabled={refreshing || loadingInsights}>
            <i className={`ti ti-refresh ${refreshing ? 'spin' : ''}`}></i> Refresh insights
          </button>
        </div>
      </div>

      {/* Portfolio scope selector */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="section-header">
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="ti ti-filter" style={{ color: 'var(--tv-forest)' }}></i> Portfolio scope
          </div>
          <button className="btn btn-secondary btn-sm" onClick={toggleSelectAll}>
            <i className={`ti ${allSelected ? 'ti-wand' : 'ti-checks'}`}></i> {allSelected ? 'Clear' : 'Select all'}
          </button>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--tv-text-muted)', margin: '0 0 12px' }}>
          Choose which parts of your finances the assistant should consider when answering.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {SCOPES.map((s) => {
            const active = selectedScopes.has(s.key);
            return (
              <button key={s.key} type="button" className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => toggleScope(s.key)} aria-pressed={active}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <i className={s.icon}></i> {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: '16px', alignItems: 'start' }}>
        {/* Insights */}
        <div className="card">
          <div className="section-header">
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="ti ti-sparkles" style={{ color: 'var(--tv-gold)' }}></i> Insights
            </div>
          </div>
          {insightsError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--tv-negative)', fontSize: '13px', marginBottom: '12px' }}>
              <i className="ti ti-alert-circle"></i> {insightsError}
            </div>
          )}
          {loadingInsights ? (
            <div className="empty-state"><i className="ti ti-loader spin"></i><p>Loading your insights…</p></div>
          ) : insights.length === 0 && !insightsError ? (
            <div className="empty-state"><i className="ti ti-bulb"></i><p>No insights yet. Try refreshing to generate new ones.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {insights.map((ins, idx) => {
                const v = severityVisual(ins.severity);
                const action = ins.suggestedAction || ins.suggested_action;
                return (
                  <div className="list-item" key={ins.id || idx} style={{ alignItems: 'flex-start' }}>
                    <div className={`item-icon ${v.iconCls}`}><i className={v.icon}></i></div>
                    <div className="item-main" style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <strong className="item-name">{ins.title || 'Insight'}</strong>
                        <span className={`badge ${v.badge}`}>{v.label}</span>
                      </div>
                      {ins.reason && <div className="item-sub" style={{ color: 'var(--tv-text-muted)', marginTop: '2px' }}>{ins.reason}</div>}
                      {action && (
                        <div style={{ marginTop: '10px', padding: '8px 10px', background: 'var(--tv-sage-pale)', borderLeft: '3px solid var(--tv-forest)', borderRadius: '6px', fontSize: '12.5px', color: 'var(--tv-text-secondary)' }}>
                          <i className="ti ti-arrow-right" style={{ color: 'var(--tv-forest)', marginRight: 6 }}></i>
                          <span><strong>Suggested:</strong> {action}</span>
                          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => ask(`${ins.title}: ${action}. How should I act on this?`)}>
                            <i className="ti ti-message-chatbot"></i> Discuss
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="section-header" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="ti ti-message-chatbot" style={{ color: 'var(--tv-forest)' }}></i> Ask the Assistant
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {/* AI model — Auto Mode picks the best engine; manual switch keeps your history */}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                title="Choose the AI model. Auto Mode picks the best one per question; switching keeps your chat.">
                <i className="ti ti-cpu" style={{ color: 'var(--tv-forest)' }}></i>
                <select className="form-input" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}
                  style={{ height: 32, padding: '0 26px 0 8px', fontSize: '12.5px', minWidth: 118 }}>
                  {MODELS.map((m) => (<option key={m.key} value={m.key}>{m.menu}</option>))}
                </select>
              </label>
              {/* Response style */}
              <div className="seg-control">
                {STYLES.map((s) => (
                  <button key={s} className={`seg-btn ${responseStyle === s ? 'active' : ''}`} onClick={() => setResponseStyle(s)} title={`${s} answers`}>{s}</button>
                ))}
              </div>
              <button className="icon-btn" title="Export conversation" onClick={exportChat} disabled={!messages.length}><i className="ti ti-download"></i></button>
              <button className="icon-btn" title="New chat" onClick={newChat} disabled={!messages.length}><i className="ti ti-trash"></i></button>
            </div>
          </div>

          <div ref={conversationRef} style={{ flex: 1, minHeight: '300px', maxHeight: '440px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', padding: '4px', marginBottom: '12px' }}>
            {messages.length === 0 ? (
              <div style={{ padding: '8px 4px' }}>
                <div className="empty-state" style={{ padding: '12px 8px' }}>
                  <i className="ti ti-message-circle"></i>
                  <p>Ask anything about your finances — or pick a starting point:</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                  {PROMPT_LIBRARY.map((g) => (
                    <div key={g.cat}>
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--tv-text-muted)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <i className={g.icon} style={{ color: 'var(--tv-forest-light)' }}></i> {g.cat}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {g.prompts.map((p) => (
                          <button key={p} className="btn btn-secondary btn-sm" onClick={() => ask(p)}>{p}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => {
                const isUser = m.role === 'user';
                return (
                  <div key={i} style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
                    <div style={{
                      background: isUser ? 'var(--tv-sage-pale)' : 'var(--tv-bg)',
                      border: '1px solid var(--tv-border)', borderRadius: '12px', padding: '9px 12px',
                      fontSize: '13px', color: 'var(--tv-text-primary)', lineHeight: '1.55',
                    }}>
                      {isUser ? <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span> : <RichText text={m.text} />}
                    </div>
                    {/* Assistant action row */}
                    {!isUser && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: 'var(--tv-text-muted)' }}>
                        <span>{fmtTime(m.ts)}</span>
                        {m.model && (
                          <span className="badge badge-forest" style={{ fontSize: 10, padding: '1px 6px' }}
                            title="Model that answered this message">
                            <i className="ti ti-cpu" style={{ fontSize: 10, marginRight: 3 }}></i>{m.model}
                          </span>
                        )}
                        <button className="icon-btn" style={{ width: 24, height: 24, marginLeft: 2 }} title="Copy" onClick={() => copyMessage(m.text, i)}>
                          <i className={`ti ${copiedAt === i ? 'ti-check' : 'ti-copy'}`} style={{ fontSize: 13 }}></i>
                        </button>
                        <button className="icon-btn" style={{ width: 24, height: 24, color: m.feedback === 'up' ? 'var(--tv-positive)' : undefined }} title="Helpful" onClick={() => setFeedback(i, 'up')}>
                          <i className="ti ti-thumb-up" style={{ fontSize: 13 }}></i>
                        </button>
                        <button className="icon-btn" style={{ width: 24, height: 24, color: m.feedback === 'down' ? 'var(--tv-negative)' : undefined }} title="Not helpful" onClick={() => setFeedback(i, 'down')}>
                          <i className="ti ti-thumb-down" style={{ fontSize: 13 }}></i>
                        </button>
                        {i === messages.length - 1 && (
                          <button className="icon-btn" style={{ width: 24, height: 24 }} title="Regenerate" onClick={regenerate} disabled={sending}>
                            <i className="ti ti-refresh" style={{ fontSize: 13 }}></i>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {sending && (
              <div style={{ alignSelf: 'flex-start', background: 'var(--tv-bg)', border: '1px solid var(--tv-border)', borderRadius: '12px', padding: '8px 12px', fontSize: '13px', color: 'var(--tv-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="ti ti-loader spin"></i> Thinking…
              </div>
            )}
          </div>

          {/* Adaptive suggestions / follow-ups */}
          {(messages.length === 0 ? suggestions : (lastIsAssistant ? suggestions : [])).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
              {(messages.length === 0 ? suggestions : suggestions).map((prompt) => (
                <button key={prompt} type="button" className="btn btn-secondary btn-sm" onClick={() => ask(prompt)} disabled={sending}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ti ti-sparkles" style={{ color: 'var(--tv-gold)' }}></i> {prompt}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--tv-text-muted)', marginBottom: '10px' }}>
            <i className="ti ti-wand" style={{ color: 'var(--tv-forest)' }}></i>
            <span>Considering: <strong style={{ color: 'var(--tv-text-secondary)' }}>{selectedLabels.length ? selectedLabels.join(', ') : 'all areas'}</strong> · <strong>{responseStyle}</strong> answers · Model: <strong>{(MODELS.find((m) => m.key === selectedModel) || MODELS[0]).label}</strong></span>
          </div>

          {chatError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--tv-negative)', fontSize: '13px', marginBottom: '8px' }}>
              <i className="ti ti-alert-circle"></i> {chatError}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea className="form-input" placeholder="Type your question…  (Enter to send, Shift+Enter for a new line)"
              value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} disabled={sending}
              rows={1} style={{ flex: 1, resize: 'none', minHeight: 40, maxHeight: 120, paddingTop: 9 }} />
            {speechSupported && (
              <button type="button" className={`btn ${listening ? 'btn-primary' : 'btn-secondary'}`} onClick={toggleVoice} title={listening ? 'Stop' : 'Speak'} disabled={sending}>
                <i className={`ti ${listening ? 'ti-microphone-filled spin' : 'ti-microphone'}`}></i>
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
              {sending ? <i className="ti ti-loader spin"></i> : <><i className="ti ti-send"></i> Send</>}
            </button>
          </form>
        </div>
      </div>

      {/* Disclaimer (DB/CMS-driven) */}
      <Disclaimer
        keyId="ai.assistant"
        variant="warning"
        fallbackTitle="AI guidance notice"
        fallbackBody="This AI assistant provides general financial insights for informational purposes only. **Not financial advice.** Consult a certified financial advisor before making decisions."
      />
    </div>
  );
}
