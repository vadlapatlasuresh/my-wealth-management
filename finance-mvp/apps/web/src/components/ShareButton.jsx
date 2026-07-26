import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Reusable native-share button — drop it anywhere you want to share a link, text, or file.
 *
 * Uses the Web Share API (navigator.share) to open the device's OS share sheet (WhatsApp,
 * iMessage, AirDrop, Slack, Telegram, Mail, …). When the browser has no share support (most
 * desktop browsers) it falls back to a small menu: Copy link, WhatsApp, Email, SMS.
 *
 * Provide the payload directly (title / text / url / files) or lazily via getShareData —
 * useful when the link must be minted or a PDF built on demand.
 *
 * Props:
 *  - title, text, url            static share payload
 *  - files                       optional File[]/Blob[] to share (Web Share Level 2)
 *  - getShareData                async () => ({ title, text, url, files }) — takes precedence
 *  - label                       button text (default "Share"); pass "" for icon-only
 *  - icon                        Tabler icon class (default "ti-share")
 *  - variant                     "secondary" | "primary" | "icon" (default "secondary")
 *  - size                        "sm" | "md" (default "sm")
 *  - className, title (tooltip)
 *  - fallbackChannels            subset of ["copy","whatsapp","email","sms"] (default all)
 *  - onShared(method)            called after a successful share/copy
 *  - onError(err)                called on unexpected failure (cancels are ignored)
 */
export default function ShareButton({
  title, text, url, files,
  getShareData,
  label = 'Share',
  icon = 'ti-share',
  variant = 'secondary',
  size = 'sm',
  className = '',
  tooltip,
  fallbackChannels = ['copy', 'whatsapp', 'email', 'sms'],
  onShared,
  onError,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [data, setData] = useState(null); // resolved payload backing the fallback menu
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const resolve = useCallback(async () => {
    if (getShareData) return (await getShareData()) || {};
    return { title, text, url, files };
  }, [getShareData, title, text, url, files]);

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const d = await resolve();
      setData(d);
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      // Prefer the native share sheet. Drop files if the platform can't share them.
      if (nav && typeof nav.share === 'function') {
        const payload = { title: d.title, text: d.text, url: d.url };
        if (d.files && d.files.length && nav.canShare && nav.canShare({ files: d.files })) {
          payload.files = d.files;
        }
        try {
          await nav.share(payload);
          onShared?.('native');
          return;
        } catch (err) {
          if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return; // user cancelled
          // Otherwise fall through to the manual menu.
        }
      }
      setMenuOpen(true);
    } catch (err) {
      onError?.(err);
    } finally {
      setBusy(false);
    }
  }, [busy, resolve, onShared, onError]);

  const shareText = (d) => [d?.text, d?.url].filter(Boolean).join(' ').trim();

  async function copyLink() {
    const d = data || (await resolve());
    const toCopy = d.url || shareText(d);
    try {
      await navigator.clipboard.writeText(toCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      onShared?.('copy');
    } catch (err) { onError?.(err); }
  }

  function openChannel(kind) {
    const d = data || {};
    const msg = shareText(d);
    let href = '';
    if (kind === 'whatsapp') href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    else if (kind === 'email') href = `mailto:?subject=${encodeURIComponent(d.title || 'Shared with you')}&body=${encodeURIComponent([d.text, d.url].filter(Boolean).join('\n\n'))}`;
    else if (kind === 'sms') href = `sms:?&body=${encodeURIComponent(msg)}`;
    if (href) {
      window.open(href, kind === 'email' || kind === 'sms' ? '_self' : '_blank', 'noopener,noreferrer');
      onShared?.(kind);
      setMenuOpen(false);
    }
  }

  const btnClass = variant === 'icon'
    ? 'icon-btn'
    : `btn btn-${variant === 'primary' ? 'primary' : 'secondary'}${size === 'sm' ? ' btn-sm' : ''}`;

  const channelMeta = {
    copy: { icon: copied ? 'ti-check' : 'ti-link', label: copied ? 'Copied!' : 'Copy link', fn: copyLink },
    whatsapp: { icon: 'ti-brand-whatsapp', label: 'WhatsApp', fn: () => openChannel('whatsapp') },
    email: { icon: 'ti-mail', label: 'Email', fn: () => openChannel('email') },
    sms: { icon: 'ti-message', label: 'Text message', fn: () => openChannel('sms') },
  };

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }} className={className}>
      <button type="button" className={btnClass} onClick={handleClick} disabled={busy} title={tooltip || 'Share'}>
        <i className={`ti ${busy ? 'ti-loader-2' : icon}`}></i>{variant !== 'icon' && label ? ` ${label}` : ''}
      </button>
      {menuOpen && (
        <div role="menu" style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, minWidth: 180,
          background: 'var(--tv-card, #fff)', border: '1px solid var(--tv-border, rgba(0,0,0,.1))',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.16)', padding: 6,
        }}>
          {fallbackChannels.map((k) => channelMeta[k] && (
            <button key={k} type="button" role="menuitem" onClick={channelMeta[k].fn}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px',
                background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer',
                fontSize: 14, color: 'var(--tv-text-primary, inherit)', textAlign: 'left',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--tv-chip, rgba(0,0,0,.05))'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <i className={`ti ${channelMeta[k].icon}`} style={{ width: 18, textAlign: 'center' }}></i>
              {channelMeta[k].label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
