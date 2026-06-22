import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MODULE_REGISTRY,
  DEFAULT_SECTIONS,
  DEFAULT_CONFIG,
} from './moduleRegistry';
import { API_BASE } from './apiBase';

/* remoteConfig.js
   Remote config client for nav / routes / theme.

   The gateway (http://localhost:8080) exposes:
     GET /api/v1/config/app?platform=web
       -> { theme, version, sections:[{id,label,order}],
            modules:[{id,title,icon,route,section,order,enabled,platforms:[],requiredFlags:[]}],
            dashboardLayout:[] }
     GET /api/v1/config/flags
       -> { flags: { "<key>": boolean } }

   Design goals:
   - NEVER throw. On any failure we fall back to last-known-good cache, then to
     the bundled DEFAULT built from the module registry (current behavior).
   - Cache last successful result to localStorage so first paint is instant and
     offline reloads keep working.
*/

const APP_CONFIG_URL = `${API_BASE}/api/v1/config/app?platform=web`;
const FLAGS_URL = `${API_BASE}/api/v1/config/flags`;
const CACHE_KEY = 'tv_remote_config';
const FETCH_TIMEOUT_MS = 4000;
const PLATFORM = 'web';

/* The shape we cache and pass around the app. */
function makeBundle(config, flags) {
  return { config, flags: flags || {} };
}

/* Bundled default (used when nothing else is available). */
export const DEFAULT_BUNDLE = makeBundle(DEFAULT_CONFIG, {});

/* ---- cache helpers ---- */

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.config && Array.isArray(parsed.config.modules)) {
      return makeBundle(parsed.config, parsed.flags || {});
    }
  } catch {
    /* ignore corrupt cache */
  }
  return null;
}

function writeCache(bundle) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(bundle));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

/* fetch with an abort-based timeout. Returns parsed JSON or throws. */
async function fetchJSON(url, signal) {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/* Validate / normalize the remote app config into our expected shape.
   Returns null if it's unusable so callers can fall back. */
function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const modules = Array.isArray(raw.modules) ? raw.modules : null;
  if (!modules) return null;
  const sections = Array.isArray(raw.sections) && raw.sections.length
    ? raw.sections
    : DEFAULT_SECTIONS.map((s) => ({ id: s.id, label: s.label, order: s.order }));
  return {
    theme: raw.theme ?? null,
    version: raw.version ?? 'remote',
    sections,
    modules,
    dashboardLayout: Array.isArray(raw.dashboardLayout) ? raw.dashboardLayout : [],
  };
}

/* ---- public API ---- */

/* loadRemoteConfig(): async, never throws.
   Tries the network (4s timeout). On success caches + returns the fresh bundle.
   On failure returns last cache, else the bundled DEFAULT. */
export async function loadRemoteConfig() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const [appRaw, flagsRaw] = await Promise.all([
      fetchJSON(APP_CONFIG_URL, controller.signal),
      fetchJSON(FLAGS_URL, controller.signal).catch(() => ({ flags: {} })),
    ]);
    const config = normalizeConfig(appRaw);
    if (!config) {
      return readCache() || DEFAULT_BUNDLE;
    }
    const flags = (flagsRaw && typeof flagsRaw.flags === 'object' && flagsRaw.flags) || {};
    const bundle = makeBundle(config, flags);
    writeCache(bundle);
    return bundle;
  } catch {
    return readCache() || DEFAULT_BUNDLE;
  } finally {
    clearTimeout(timer);
  }
}

/* getCachedConfigSync(): synchronous cache-or-default for first paint. */
export function getCachedConfigSync() {
  return readCache() || DEFAULT_BUNDLE;
}

/* useRemoteConfig(): returns { config, flags, loading, reload }.
   Returns the sync cached/default bundle immediately, then refreshes from the
   network in the background and updates state. */
export function useRemoteConfig() {
  const [bundle, setBundle] = useState(getCachedConfigSync);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const fresh = await loadRemoteConfig();
    if (mounted.current) {
      setBundle(fresh);
      setLoading(false);
    }
    return fresh;
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  return {
    config: bundle.config,
    flags: bundle.flags,
    loading,
    reload: refresh,
  };
}

/* requiredFlags satisfied = every listed flag is truthy in `flags`. */
function flagsSatisfied(requiredFlags, flags) {
  if (!Array.isArray(requiredFlags) || requiredFlags.length === 0) return true;
  return requiredFlags.every((key) => Boolean(flags && flags[key]));
}

/* platform match: empty/missing platforms => available everywhere. */
function platformOk(platforms) {
  if (!Array.isArray(platforms) || platforms.length === 0) return true;
  return platforms.includes(PLATFORM);
}

/* resolveNav(config, registry): returns ordered sections, each with their
   enabled+visible modules (ordered), intersected with the registry.

   A module appears in nav only if ALL of:
     - it exists in the registry
     - it has a sidebar section (registry.section != null)
     - enabled !== false
     - its platforms include 'web' (or none specified)
     - all requiredFlags are satisfied
     - its registry section matches a known section

   Returns [{ id, label, items:[{ id, to, icon, label, badge }] }] for sections
   that have at least one visible item. If the config yields zero modules (which
   shouldn't happen), falls back to the DEFAULT config. */
export function resolveNav(config, registry = MODULE_REGISTRY, flags = {}) {
  const cfg = (config && Array.isArray(config.modules) && config.modules.length)
    ? config
    : DEFAULT_CONFIG;

  // Section ordering + labels from config, falling back to defaults.
  const sectionList = (Array.isArray(cfg.sections) && cfg.sections.length)
    ? cfg.sections
    : DEFAULT_SECTIONS;
  const orderedSections = [...sectionList].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );
  const sectionIds = new Set(orderedSections.map((s) => s.id));

  // Bucket visible modules by section.
  const buckets = {};
  for (const mod of cfg.modules) {
    if (!mod || !mod.id) continue;
    const reg = registry[mod.id];
    if (!reg) continue;                                   // unknown to this app
    if (reg.section == null) continue;                    // route-only, never in nav
    if (mod.enabled === false) continue;                  // explicitly disabled
    if (!platformOk(mod.platforms)) continue;             // not for web
    if (!flagsSatisfied(mod.requiredFlags, flags)) continue;

    const sectionId = mod.section || reg.section;
    if (!sectionIds.has(sectionId)) continue;             // section not present

    const item = {
      id: mod.id,
      to: reg.route,
      icon: mod.icon || reg.icon,
      label: mod.title || reg.title,
      badge: reg.badge,
      order: mod.order ?? reg.defaultOrder ?? 0,
    };
    (buckets[sectionId] = buckets[sectionId] || []).push(item);
  }

  // Union with the registry: include default-nav modules the remote config doesn't
  // mention at all, so a NEW module (added to the registry after the stored config was
  // written) shows up without needing a config update. Modules the config DOES list —
  // including ones it disables — stay governed by the loop above.
  const mentioned = new Set(cfg.modules.map((m) => m && m.id).filter(Boolean));
  for (const [id, reg] of Object.entries(registry)) {
    if (mentioned.has(id)) continue;            // config decides these
    if (!reg || reg.section == null) continue;  // route-only, never in nav
    if (reg.inNavByDefault === false) continue; // not a default sidebar item
    if (!sectionIds.has(reg.section)) continue; // its section isn't present
    (buckets[reg.section] = buckets[reg.section] || []).push({
      id, to: reg.route, icon: reg.icon, label: reg.title,
      badge: reg.badge, order: reg.defaultOrder ?? 0,
    });
  }

  const result = [];
  for (const section of orderedSections) {
    const items = buckets[section.id];
    if (!items || !items.length) continue;
    items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    result.push({ id: section.id, label: section.label, items });
  }

  // Safety net: if config produced an empty nav, fall back to DEFAULT.
  if (!result.length && cfg !== DEFAULT_CONFIG) {
    return resolveNav(DEFAULT_CONFIG, registry, flags);
  }
  return result;
}
