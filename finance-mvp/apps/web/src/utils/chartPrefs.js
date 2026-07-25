// Shared chart-type preference store — the single source of truth for "which chart does
// this section render". Every chart surface (Cash flow, Spending, Income, …) declares a
// DEFAULT type, and the user may override it per section from the ChartSelector. The choice
// persists to localStorage so it sticks across reloads and propagates to every screen that
// reads the same section key.
//
// Pure + framework-light: the store is a tiny observable so any number of mounted selectors
// stay in sync without prop-drilling, and useChartPref() is the thin React binding.

import { useSyncExternalStore, useCallback } from "react";

// The chart types the app knows how to render. `sankey` and `pnl` are cash-flow-only;
// donut/bar/line are general. Keep these ids stable — they're persisted.
export const CHART_TYPES = {
  sankey: { id: "sankey", label: "Sankey", icon: "ti ti-chart-sankey" },
  bar: { id: "bar", label: "Bar", icon: "ti ti-chart-bar" },
  donut: { id: "donut", label: "Donut", icon: "ti ti-chart-donut" },
  line: { id: "line", label: "Trend", icon: "ti ti-chart-line" },
  pnl: { id: "pnl", label: "Profit & Loss", icon: "ti ti-table" },
};

// Per-section defaults. A section may only offer a subset of types (`allowed`); the selector
// renders exactly those. Defaults mirror the reference designs: Cash flow → Sankey,
// Spending → Donut, Income → Bar.
export const CHART_SECTIONS = {
  cashflow: { default: "sankey", allowed: ["sankey", "bar", "pnl"] },
  spending: { default: "donut", allowed: ["donut", "bar"] },
  income: { default: "bar", allowed: ["bar", "donut", "line"] },
  networth: { default: "line", allowed: ["line", "bar"] },
};

const STORAGE_KEY = "tv_chart_prefs";

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

let cache = readAll();
const listeners = new Set();

function emit() {
  for (const l of listeners) l();
}

/** Resolved chart type for a section: the user's override, else the section default. */
export function getChartType(section) {
  const cfg = CHART_SECTIONS[section];
  const fallback = cfg?.default || "bar";
  const chosen = cache[section];
  // Guard against a stale/foreign value that the section no longer allows.
  if (chosen && (!cfg || cfg.allowed.includes(chosen))) return chosen;
  return fallback;
}

/** Persist a section's chart type and notify every mounted selector. */
export function setChartType(section, type) {
  cache = { ...cache, [section]: type };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* private mode / quota — the in-memory cache still drives this session */
  }
  emit();
}

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * useChartPref(section) → [type, setType, allowedTypes].
 * `type` re-renders whenever ANY selector changes this section, so two views of the same
 * section (e.g. a card and a full page) never disagree.
 */
export function useChartPref(section) {
  const type = useSyncExternalStore(
    subscribe,
    () => getChartType(section),
    () => getChartType(section)
  );
  const set = useCallback((t) => setChartType(section, t), [section]);
  const allowed = (CHART_SECTIONS[section]?.allowed || ["bar"]).map((id) => CHART_TYPES[id]);
  return [type, set, allowed];
}
