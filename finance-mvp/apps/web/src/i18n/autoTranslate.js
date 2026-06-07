// autoTranslate.js
// -----------------------------------------------------------------------------
// Machine-translation provider used to translate the long tail of UI strings
// (everything not in the bundled locale files) at runtime. Paired with
// ./domTranslator.js, this is what makes the WHOLE app switch language, not just
// the navigation chrome.
//
// PROVIDERS (auto-selected):
//   1. If VITE_TRANSLATE_ENDPOINT is set  -> that endpoint (LibreTranslate shape).
//      Best for production: self-host LibreTranslate (free, no quota, batch).
//   2. Otherwise (DEFAULT, zero-config)   -> MyMemory public API
//      (https://mymemory.translated.net). Free, no key, CORS-enabled, so the app
//      translates automatically out of the box. Anonymous quota is limited; set
//      VITE_TRANSLATE_EMAIL to raise it, or point at LibreTranslate for scale.
//
// Guarantees:
//   - NEVER throws / never blocks the UI. Any failure returns the source text.
//   - Each unique (text, language) is translated at most once, then cached in
//     localStorage forever (instant on later visits / reloads).
//   - Concurrent identical requests are de-duped in-flight.
// -----------------------------------------------------------------------------

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
const ENDPOINT = env.VITE_TRANSLATE_ENDPOINT || "";
const API_KEY = env.VITE_TRANSLATE_API_KEY || "";
const EMAIL = env.VITE_TRANSLATE_EMAIL || ""; // optional MyMemory quota booster

const SOURCE_LANG = "en";
const TIMEOUT_MS = 8000;
const CACHE_PREFIX = "tv_mt_"; // tv_mt_<lang>

// There is always a provider now (MyMemory default), so auto-translate is on by
// default. This stays a function so callers read intent clearly.
export function isAutoTranslateEnabled() {
  return true;
}

export function activeProvider() {
  return ENDPOINT ? "custom" : "mymemory";
}

/* ---- per-language localStorage cache ---- */

function cacheKey(lang) {
  return `${CACHE_PREFIX}${lang}`;
}

function readCache(lang) {
  try {
    const raw = localStorage.getItem(cacheKey(lang));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// Batched writes: we may translate many strings quickly, so coalesce persistence.
let pendingWrite = null;
function scheduleCacheWrite(lang, map) {
  cacheMem[lang] = map;
  if (pendingWrite) return;
  pendingWrite = setTimeout(() => {
    pendingWrite = null;
    try {
      for (const l of Object.keys(cacheMem)) {
        localStorage.setItem(cacheKey(l), JSON.stringify(cacheMem[l]));
      }
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, 400);
}

// In-memory mirror so rapid lookups during a translate pass don't hit JSON.parse.
const cacheMem = {};
function getCache(lang) {
  if (!cacheMem[lang]) cacheMem[lang] = readCache(lang);
  return cacheMem[lang];
}

const inflight = new Map(); // `${lang}|${text}` -> Promise<string>

/* ---- providers ---- */

async function translateViaLibre(text, lang, signal) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: SOURCE_LANG,
      target: lang,
      format: "text",
      ...(API_KEY ? { api_key: API_KEY } : {}),
    }),
    signal,
  });
  if (!res.ok) throw new Error(`translate HTTP ${res.status}`);
  const data = await res.json().catch(() => null);
  if (data && typeof data.translatedText === "string") return data.translatedText;
  if (Array.isArray(data) && data[0] && data[0].translatedText) return data[0].translatedText;
  return null;
}

async function translateViaMyMemory(text, lang, signal) {
  const params = new URLSearchParams({
    q: text,
    langpair: `${SOURCE_LANG}|${lang}`,
  });
  if (EMAIL) params.set("de", EMAIL);
  const res = await fetch(
    `https://api.mymemory.translated.net/get?${params.toString()}`,
    { signal, headers: { Accept: "application/json" } }
  );
  if (!res.ok) throw new Error(`translate HTTP ${res.status}`);
  const data = await res.json().catch(() => null);
  const out = data && data.responseData && data.responseData.translatedText;
  if (typeof out !== "string" || !out) return null;
  // MyMemory sometimes returns quota/limit notices in the text field on failure.
  if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE/i.test(out)) return null;
  return out;
}

/**
 * translateText(text, lang): Promise<string>
 * Returns the translation, or the original text on any miss/failure.
 */
export async function translateText(text, lang) {
  if (!text || !lang || lang === SOURCE_LANG) return text;
  // Nothing translatable (pure numbers / symbols / currency) — skip to save quota.
  if (!/[A-Za-z]/.test(text)) return text;

  const cache = getCache(lang);
  if (cache[text] != null) return cache[text];

  const memo = `${lang}|${text}`;
  if (inflight.has(memo)) return inflight.get(memo);

  const promise = (async () => {
    let controller, timer;
    try {
      controller = new AbortController();
      timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const out = ENDPOINT
        ? await translateViaLibre(text, lang, controller.signal)
        : await translateViaMyMemory(text, lang, controller.signal);
      if (!out) return text;
      cache[text] = out;
      scheduleCacheWrite(lang, cache);
      return out;
    } catch {
      return text; // never break the UI
    } finally {
      if (timer) clearTimeout(timer);
      inflight.delete(memo);
    }
  })();

  inflight.set(memo, promise);
  return promise;
}
