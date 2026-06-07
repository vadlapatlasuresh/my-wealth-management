export function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value ?? 0);
}

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

/* Time-of-day greeting based on the given (or current) time.
   Morning < 12:00, afternoon < 17:00, evening otherwise. */
export function greeting(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const h = Number.isNaN(d.getTime()) ? new Date().getHours() : d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* Full date + time in the user's system locale + timezone by default.
   Pass a `locale` (e.g. "en-GB"), `timeZone`, or `hour12` later to let users switch. */
export function formatDateTime(date = new Date(), { locale, timeZone, hour12 } = {}) {
  const d = date instanceof Date ? date : new Date(date);
  const dateStr = d.toLocaleDateString(locale, {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone,
  });
  const timeStr = d.toLocaleTimeString(locale, {
    hour: "numeric", minute: "2-digit", timeZone, hour12,
  });
  return { dateStr, timeStr };
}

/* Compact "time ago" for last-refreshed indicators: "just now", "5m ago", "3h ago", "2d ago". */
export function timeAgo(input) {
  if (!input) return "—";
  const then = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (Number.isNaN(then)) return "—";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* Start Date for a named range relative to now. Used by date-range filters across screens.
   Supported: 1H, 1D, 1W, 1M, 3M, 6M, YTD, 1Y, All. Returns null for "All". */
export function rangeStart(range, now = new Date()) {
  const d = new Date(now);
  switch (range) {
    case "1H": d.setHours(d.getHours() - 1); return d;
    case "1D": d.setDate(d.getDate() - 1); return d;
    case "1W": d.setDate(d.getDate() - 7); return d;
    case "1M": d.setMonth(d.getMonth() - 1); return d;
    case "3M": d.setMonth(d.getMonth() - 3); return d;
    case "6M": d.setMonth(d.getMonth() - 6); return d;
    case "YTD": return new Date(now.getFullYear(), 0, 1);
    case "1Y": d.setFullYear(d.getFullYear() - 1); return d;
    case "All": default: return null;
  }
}
