// Content / CMS client for DB-driven disclaimers.
//
// All functions here are defensive: the disclaimer system must NEVER break the UI.
// On any failure we fall back to cached values (localStorage) or an empty result,
// and the <Disclaimer> component renders its own hard fallback when nothing is found.

import { API_BASE } from "../config/apiBase";

const FETCH_TIMEOUT_MS = 4000;

const cacheKey = (locale) => `tv_disclaimers_${locale}`;

// In-memory promise cache so multiple <Disclaimer> components mounting on the
// same page share a single network request per (locale + key-set). The key is
// the sorted list of requested keys so identical requests are deduped within a tick.
const inflight = new Map();

function readLocalCache(locale) {
  try {
    const raw = localStorage.getItem(cacheKey(locale));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalCache(locale, map) {
  try {
    localStorage.setItem(cacheKey(locale), JSON.stringify(map));
  } catch {
    // storage full / unavailable — non-fatal
  }
}

function toMap(items) {
  const map = {};
  if (Array.isArray(items)) {
    for (const it of items) {
      if (it && it.key) map[it.key] = it;
    }
  }
  return map;
}

function getAuthToken() {
  try {
    return (
      localStorage.getItem("terravet_token") ||
      localStorage.getItem("finance_token") ||
      ""
    );
  } catch {
    return "";
  }
}

/**
 * Fetch disclaimers for the given keys. Returns a map keyed by disclaimer key:
 *   { "ai.assistant": { key, version, locale, title, bodyMarkdown, requiresAcceptance }, ... }
 *
 * - 4s timeout
 * - merges fresh results into the localStorage cache (per locale)
 * - NEVER throws: on failure returns whatever is cached (or {})
 * - dedupes concurrent identical requests via an in-memory promise cache
 */
export function fetchDisclaimers(keys = [], locale = "en") {
  const wanted = Array.from(new Set((keys || []).filter(Boolean)));
  if (wanted.length === 0) return Promise.resolve({});

  const memoKey = `${locale}|${[...wanted].sort().join(",")}`;
  if (inflight.has(memoKey)) return inflight.get(memoKey);

  const promise = (async () => {
    const cached = readLocalCache(locale);

    let controller;
    let timer;
    try {
      controller = new AbortController();
      timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const url = `${API_BASE}/api/v1/content/disclaimers?keys=${encodeURIComponent(
        wanted.join(",")
      )}&locale=${encodeURIComponent(locale)}`;

      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`content request failed (${res.status})`);

      const data = await res.json().catch(() => ({}));
      const fresh = toMap(data && data.items);

      // Merge fresh values over the cache and persist.
      const merged = { ...cached, ...fresh };
      writeLocalCache(locale, merged);
      return merged;
    } catch {
      // Network / timeout / parse failure — fall back to cache, never throw.
      return cached;
    } finally {
      if (timer) clearTimeout(timer);
      // Allow a fresh request on the next page interaction.
      inflight.delete(memoKey);
    }
  })();

  inflight.set(memoKey, promise);
  return promise;
}

/**
 * Record that the user accepted a disclaimer version. Best-effort: ignores failure.
 */
export async function acceptDisclaimer(key, version) {
  if (!key) return { accepted: false };
  const token = getAuthToken();
  let controller;
  let timer;
  try {
    controller = new AbortController();
    timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    await fetch(`${API_BASE}/api/v1/content/disclaimers/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ key, version }),
      signal: controller.signal,
    });
    return { accepted: true };
  } catch {
    return { accepted: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
