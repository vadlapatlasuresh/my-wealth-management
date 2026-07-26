import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';

/**
 * Automated payment reminders (dunning) settings for a business (order-to-cash Phase 1.9).
 * Toggle on/off, pick a channel, choose when to remind (offsets around the due date), and
 * run due reminders now. Self-contained: fetches + saves its own settings.
 */
const OFFSET_OPTIONS = [
  { v: -7, label: '7 days before due' },
  { v: -3, label: '3 days before due' },
  { v: 0, label: 'On the due date' },
  { v: 3, label: '3 days overdue' },
  { v: 7, label: '7 days overdue' },
  { v: 14, label: '14 days overdue' },
];

function parseOffsets(csv) {
  return String(csv || '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}

export default function ReminderSettingsCard({ businessId, onError, onFlash }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.getReminderSettings(businessId);
      setSettings({ enabled: !!s.enabled, channel: s.channel || 'AUTO', offsets: parseOffsets(s.offsets || '-3,0,7') });
    } catch (err) { onError?.(err?.message || 'Could not load reminder settings.'); }
  }, [businessId, onError]);

  useEffect(() => { load(); }, [load]);

  async function save(next) {
    setSettings(next);
    try {
      setSaving(true);
      await api.updateReminderSettings(businessId, {
        enabled: next.enabled, channel: next.channel, offsets: next.offsets.join(','),
      });
    } catch (err) { onError?.(err?.message || 'Could not save reminder settings.'); }
    finally { setSaving(false); }
  }

  function toggleOffset(v) {
    const has = settings.offsets.includes(v);
    const offsets = has ? settings.offsets.filter((x) => x !== v) : [...settings.offsets, v].sort((a, b) => a - b);
    save({ ...settings, offsets });
  }

  async function runNow() {
    try {
      setRunning(true);
      const res = await api.runReminders(businessId);
      onFlash?.(res?.sent > 0 ? `${res.sent} reminder${res.sent === 1 ? '' : 's'} sent.` : 'No reminders were due right now.');
    } catch (err) { onError?.(err?.message || 'Could not run reminders.'); }
    finally { setRunning(false); }
  }

  if (!settings) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-header">
        <div className="section-title"><i className="ti ti-bell-ringing" style={{ marginRight: 6, color: 'var(--tv-forest-light)' }}></i>Automated payment reminders</div>
        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <input type="checkbox" checked={settings.enabled} onChange={(e) => save({ ...settings, enabled: e.target.checked })} disabled={saving} />
          {settings.enabled ? 'On' : 'Off'}
        </label>
      </div>
      <p className="item-sub" style={{ margin: '-4px 0 12px' }}>
        Automatically email/text customers about invoices around their due date. Reminders skip paid, void and draft invoices, and never send the same reminder twice.
      </p>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">When to remind</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {OFFSET_OPTIONS.map((o) => (
              <label key={o.v} className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, opacity: settings.enabled ? 1 : 0.6 }}>
                <input type="checkbox" checked={settings.offsets.includes(o.v)} onChange={() => toggleOffset(o.v)} disabled={!settings.enabled || saving} />
                {o.label}
              </label>
            ))}
          </div>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Channel</label>
          <select className="form-select" value={settings.channel} onChange={(e) => save({ ...settings, channel: e.target.value })} disabled={!settings.enabled || saving}>
            <option value="AUTO">Auto (email, else SMS)</option>
            <option value="EMAIL">Email only</option>
            <option value="SMS">SMS only</option>
          </select>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={runNow} disabled={running}>
            <i className={`ti ${running ? 'ti-loader-2' : 'ti-send'}`}></i> {running ? 'Sending…' : 'Send due reminders now'}
          </button>
        </div>
      </div>
    </div>
  );
}
