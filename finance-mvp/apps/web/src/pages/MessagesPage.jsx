import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../api';

/* Fallback messages so the inbox is never blank (empty result or API failure). */
const MOCK_MESSAGES = [
  {
    id: 'mock-1',
    type: 'BUDGET',
    title: 'You’re close to your Dining budget',
    body: 'You’ve spent 92% of your Dining budget for June ($460 of $500). At the current pace you’ll exceed it before month end. Consider easing off restaurants for the next two weeks.',
    channel: 'IN_APP',
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: 'mock-2',
    type: 'PAYMENT',
    title: 'Bill payment scheduled',
    body: 'Your bill payment of $250.00 to City Utilities has been scheduled and will be sent on June 8. You’ll get a confirmation once it clears.',
    channel: 'EMAIL',
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
  {
    id: 'mock-3',
    type: 'ACCOUNT',
    title: 'New account linked',
    body: 'Your Acme Bank Savings account was successfully connected. Balances and transactions will sync automatically every few hours.',
    channel: 'IN_APP',
    read: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
  {
    id: 'mock-4',
    type: 'SYSTEM',
    title: 'Welcome to TerraVest',
    body: 'Thanks for joining. Link your accounts, set a budget, and we’ll keep you posted with timely alerts and insights right here in your inbox.',
    channel: 'IN_APP',
    read: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
];

/* Icon + color treatment per notification type. */
function typeVisual(type) {
  switch ((type || '').toUpperCase()) {
    case 'BUDGET':
      return { icon: 'ti ti-chart-pie', cls: 'icon-amber', label: 'Budget' };
    case 'PAYMENT':
      return { icon: 'ti ti-receipt', cls: 'icon-green', label: 'Payment' };
    case 'ACCOUNT':
      return { icon: 'ti ti-building-bank', cls: 'icon-blue', label: 'Account' };
    case 'SYSTEM':
    default:
      return { icon: 'ti ti-bell', cls: 'icon-forest', label: 'System' };
  }
}

/* Relative time for recent items, falls back to a formatted date. */
function relTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fullDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function MessagesPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [usingMock, setUsingMock] = useState(false);

  const [filter, setFilter] = useState('ALL'); // ALL | UNREAD | READ
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  // Tracks which list row is hovered so we can paint a hover background inline
  // (the design system gives .list-item a background transition but no hover rule).
  const [hoveredId, setHoveredId] = useState(null);
  const [sendingTest, setSendingTest] = useState(false);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getNotifications();
      const items = Array.isArray(res?.items) ? res.items : [];
      if (items.length === 0) {
        setMessages(MOCK_MESSAGES);
        setUsingMock(true);
      } else {
        setMessages(items);
        setUsingMock(false);
      }
    } catch (err) {
      setError(err?.message || 'Could not load your messages.');
      setMessages(MOCK_MESSAGES);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Send a real test notification through the notification-service, then reload.
  async function sendTest() {
    setSendingTest(true);
    try {
      await api.testNotification();
      await loadMessages();
    } catch (err) {
      setError(err?.message || 'Could not send a test notification.');
    } finally {
      setSendingTest(false);
    }
  }

  const unreadCount = useMemo(
    () => messages.filter((m) => !m.read).length,
    [messages]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return messages
      .filter((m) => {
        if (filter === 'UNREAD' && m.read) return false;
        if (filter === 'READ' && !m.read) return false;
        if (q) {
          const hay = `${m.title || ''} ${m.body || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [messages, filter, search]);

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) || null,
    [messages, selectedId]
  );

  // Desktop convenience: keep a message visible in the reading pane so it's never
  // empty. We only default the *selection* (display) — we never auto-mark-read,
  // so the unread-on-open behavior in selectMessage() stays intact. This also
  // recovers gracefully when the current selection is filtered out of view.
  useEffect(() => {
    if (loading) return;
    if (filtered.length === 0) return;
    const stillVisible = selectedId && filtered.some((m) => m.id === selectedId);
    if (!stillVisible) {
      setSelectedId(filtered[0].id);
    }
  }, [loading, filtered, selectedId]);

  async function selectMessage(msg) {
    setSelectedId(msg.id);
    if (!msg.read) {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m))
      );
      // Mock items don't exist on the backend; skip the call for them.
      if (!usingMock && !String(msg.id).startsWith('mock-')) {
        try {
          await api.markNotificationRead(msg.id);
        } catch {
          // Ignore failures; the local state already reflects the read status.
        }
      }
    }
  }

  // Toggle the read/unread state of a single message (reading-pane action).
  // Mirrors selectMessage()'s backend rules: skip the API for mock items.
  async function toggleRead(msg, nextRead) {
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, read: nextRead } : m))
    );
    if (!usingMock && !String(msg.id).startsWith('mock-')) {
      try {
        // The API only exposes a "mark read" call; only invoke it when marking read.
        if (nextRead) await api.markNotificationRead(msg.id);
      } catch {
        // Ignore failures; local state already reflects the change.
      }
    }
  }

  async function markAllRead() {
    const unread = messages.filter((m) => !m.read);
    if (unread.length === 0) return;
    setMessages((prev) => prev.map((m) => ({ ...m, read: true })));
    if (!usingMock) {
      await Promise.allSettled(
        unread
          .filter((m) => !String(m.id).startsWith('mock-'))
          .map((m) => api.markNotificationRead(m.id))
      );
    }
  }

  return (
    <div id="page-messages" className="page active">
      <div className="page-header">
        <div>
          <div className="page-title">Messages</div>
          <div className="page-subtitle">Notifications, alerts, and updates</div>
        </div>
        <div className="page-actions" style={{ alignItems: 'center' }}>
          {unreadCount > 0 && (
            <span className="badge badge-forest">
              {unreadCount} unread
            </span>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={loadMessages}
            disabled={loading}
            title="Refresh notifications"
          >
            <i className={`ti ti-refresh ${loading ? 'spin' : ''}`}></i> Refresh
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={sendTest}
            disabled={sendingTest}
            title="Send yourself a test notification"
          >
            <i className={`ti ${sendingTest ? 'ti-loader spin' : 'ti-bell-plus'}`}></i> {sendingTest ? 'Sending…' : 'Send test'}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            title="Mark every message as read"
          >
            <i className="ti ti-checks"></i> Mark all read
          </button>
        </div>
      </div>

      {error && (
        <div
          className="badge badge-amber"
          style={{ marginBottom: 16, display: 'inline-flex' }}
        >
          <i className="ti ti-alert-triangle"></i> {error} Showing sample messages.
        </div>
      )}

      <div className="filter-bar">
        <div className="filter-search">
          <i className="ti ti-search"></i>
          <input
            type="text"
            placeholder="Search messages…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="seg-control">
          {[
            ['ALL', 'All'],
            ['UNREAD', 'Unread'],
            ['READ', 'Read'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`seg-btn ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/*
        Master–detail split view. We use flex (not grid-2) so we can pin the
        inbox to a fixed width and let the reading pane flex. align-items:
        flex-start lets the sticky reading pane scroll independently, and
        flex-wrap lets the columns stack on narrow screens.
      */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        {/* Master list — fixed width, scrolls inside its own card */}
        <div
          className="card"
          style={{ flex: '0 0 360px', minWidth: 300, alignSelf: 'stretch' }}
        >
          <div className="section-header">
            <div className="section-title" style={{ marginBottom: 0 }}>Inbox</div>
            <span className="badge badge-gray">{filtered.length}</span>
          </div>
          <div className="divider" style={{ margin: '0 0 4px' }} />

          {/* The list scrolls on its own so the page (and reading pane) stay put. */}
          <div
            style={{
              maxHeight: 'calc(100vh - 320px)',
              overflowY: 'auto',
              margin: '0 -4px',
              padding: '0 4px',
            }}
          >
          {loading ? (
            <div className="empty-state">
              <i className="ti ti-loader spin"></i>
              <p>Loading your messages…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <i className="ti ti-mail-off"></i>
              <p style={{ fontWeight: 600, color: 'var(--tv-text-primary)', marginBottom: 4 }}>
                {messages.length === 0 ? 'Your inbox is empty' : 'No messages match'}
              </p>
              <p>
                {messages.length === 0
                  ? 'New notifications will appear here.'
                  : 'Try a different filter or search term.'}
              </p>
            </div>
          ) : (
            <div>
              {filtered.map((m) => {
                const v = typeVisual(m.type);
                const isSelected = m.id === selectedId;
                const isHovered = m.id === hoveredId;
                // Selected row keeps the sage-pale highlight; hovered (but not
                // selected) rows get a subtle background for affordance.
                const rowBg = isSelected
                  ? 'var(--tv-sage-pale)'
                  : isHovered
                    ? 'var(--tv-border)'
                    : undefined;
                return (
                  <div
                    key={m.id}
                    className="list-item"
                    onClick={() => selectMessage(m)}
                    onMouseEnter={() => setHoveredId(m.id)}
                    onMouseLeave={() => setHoveredId((id) => (id === m.id ? null : id))}
                    style={{
                      cursor: 'pointer',
                      background: rowBg,
                      borderRadius: 'var(--radius-md)',
                      padding: '11px 8px',
                    }}
                  >
                    <div className={`item-icon ${v.cls}`}>
                      <i className={v.icon}></i>
                    </div>
                    <div className="item-main">
                      <div className="item-name" style={{ fontWeight: m.read ? 500 : 700 }}>
                        {m.title || v.label}
                      </div>
                      <div
                        className="item-sub"
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.body || ''}
                      </div>
                    </div>
                    <div className="item-right">
                      <div className="item-meta">{relTime(m.createdAt)}</div>
                      {!m.read && (
                        <span
                          aria-label="Unread"
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--tv-forest)',
                            marginTop: 6,
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>

        {/*
          Reading pane — flexes to fill remaining width and sticks to the top so
          it stays in view while the inbox list scrolls. min-height keeps it from
          collapsing when the body is short.
        */}
        <div
          className="card"
          style={{
            flex: 1,
            minWidth: 320,
            position: 'sticky',
            top: 16,
            minHeight: 'calc(100vh - 320px)',
          }}
        >
          {selected ? (
            (() => {
              const v = typeVisual(selected.type);
              return (
                <div>
                  <div className="section-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className={`item-icon ${v.cls}`}>
                        <i className={v.icon}></i>
                      </div>
                      <div>
                        <div className="section-title" style={{ marginBottom: 2 }}>
                          {selected.title || v.label}
                        </div>
                        <div className="item-meta">{fullDate(selected.createdAt)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Toggle read/unread without leaving the reading pane. */}
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => toggleRead(selected, !selected.read)}
                        title={selected.read ? 'Mark as unread' : 'Mark as read'}
                      >
                        <i className={selected.read ? 'ti ti-mail' : 'ti ti-mail-opened'}></i>
                        {selected.read ? 'Mark as unread' : 'Mark as read'}
                      </button>
                      <span className="badge badge-forest">{v.label}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span className={`badge ${selected.read ? 'badge-gray' : 'badge-green'}`}>
                      <i className={selected.read ? 'ti ti-mail-opened' : 'ti ti-mail'}></i>
                      {selected.read ? 'Read' : 'Unread'}
                    </span>
                    {selected.channel && (
                      <span className="badge badge-gray">
                        <i className="ti ti-broadcast"></i> {selected.channel}
                      </span>
                    )}
                  </div>

                  <div className="divider" />

                  <p
                    style={{
                      fontSize: '13.5px',
                      lineHeight: 1.6,
                      color: 'var(--tv-text-primary)',
                    }}
                  >
                    {selected.body || 'No additional details.'}
                  </p>
                </div>
              );
            })()
          ) : (
            <div className="empty-state">
              <i className="ti ti-mail-opened"></i>
              <p style={{ fontWeight: 600, color: 'var(--tv-text-primary)', marginBottom: 4 }}>
                Select a message
              </p>
              <p>Choose a message from your inbox to read it here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
