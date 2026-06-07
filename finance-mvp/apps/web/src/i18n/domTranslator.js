// domTranslator.js
// -----------------------------------------------------------------------------
// Translates the ENTIRE rendered page content automatically — so the whole app
// changes language, not just the strings we hand-keyed. It walks the visible text
// (and a few attributes) inside a root element, machine-translates each unique
// phrase via ./autoTranslate, and swaps it in. A MutationObserver keeps newly
// rendered content (route changes, async data) translated too.
//
// Design notes / safety:
//  - Original English is remembered per node (__tvOrig) so switching back to
//    English restores instantly without a reload.
//  - We only WRITE when the value actually changes, so our own writes don't
//    retrigger the observer into a loop. A `writing` guard adds belt-and-braces.
//  - Skips <script>/<style>/<code>/<pre>, inputs' real values, and anything under
//    [data-no-translate] (use that to opt an element out, e.g. brand names).
//  - Everything is best-effort: failures leave the English text in place.
// -----------------------------------------------------------------------------

import { translateText } from "./autoTranslate";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA"]);
const ATTRS = ["placeholder", "title", "aria-label", "alt"];

let writing = false;

function inSkipZone(node) {
  let el = node.nodeType === 1 ? node : node.parentElement;
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute && el.hasAttribute("data-no-translate")) return true;
    el = el.parentElement;
  }
  return false;
}

function collectTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (!/[A-Za-z]/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT; // numbers/symbols only
      if (inSkipZone(n)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const out = [];
  let n;
  while ((n = walker.nextNode())) out.push(n);
  return out;
}

function collectAttrTargets(root) {
  const out = [];
  const sel = ATTRS.map((a) => `[${a}]`).join(",");
  root.querySelectorAll(sel).forEach((el) => {
    if (inSkipZone(el)) return;
    ATTRS.forEach((a) => {
      const v = el.getAttribute(a);
      if (v && v.trim() && /[A-Za-z]/.test(v)) out.push({ el, attr: a });
    });
  });
  return out;
}

// Run async work with a small concurrency cap so we don't fan out hundreds of
// requests at once (kind to free translation endpoints).
async function pool(items, size, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      // eslint-disable-next-line no-await-in-loop
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

export function restoreSubtree(root) {
  if (!root) return;
  writing = true;
  try {
    collectTextNodesRaw(root).forEach((n) => {
      if (n.__tvOrig != null && n.nodeValue !== n.__tvOrig) n.nodeValue = n.__tvOrig;
    });
    const sel = ATTRS.map((a) => `[${a}]`).join(",");
    root.querySelectorAll(sel).forEach((el) => {
      if (!el.__tvAttrOrig) return;
      for (const a of ATTRS) {
        if (el.__tvAttrOrig[a] != null && el.getAttribute(a) !== el.__tvAttrOrig[a]) {
          el.setAttribute(a, el.__tvAttrOrig[a]);
        }
      }
    });
  } finally {
    writing = false;
  }
}

// Like collectTextNodes but without the language filter — used for restore.
function collectTextNodesRaw(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const out = [];
  let n;
  while ((n = walker.nextNode())) out.push(n);
  return out;
}

export async function translateSubtree(root, lang) {
  if (!root) return;
  const base = (lang || "en").split("-")[0];
  if (base === "en") {
    restoreSubtree(root);
    return;
  }

  // ---- text nodes ----
  const nodes = collectTextNodes(root);
  const pending = [];
  for (const n of nodes) {
    // If the node still shows a translation WE applied (in any language), its
    // English source is __tvOrig — use that so es->fr translates from English,
    // not from the current Spanish text. Otherwise React (re)rendered fresh
    // English, so capture it as the new source.
    let orig;
    if (n.__tvTranslated != null && n.nodeValue === n.__tvTranslated) {
      orig = n.__tvOrig;
    } else {
      orig = n.nodeValue;
      n.__tvOrig = orig;
    }
    const key = orig.trim();
    if (key) pending.push({ n, orig, key });
  }

  // ---- attributes ----
  const attrTargets = collectAttrTargets(root);
  const attrPending = [];
  for (const { el, attr } of attrTargets) {
    if (!el.__tvAttrOrig) el.__tvAttrOrig = {};
    let orig;
    const cur = el.getAttribute(attr);
    if (el.__tvAttrTranslated && el.__tvAttrTranslated[attr] === cur) {
      orig = el.__tvAttrOrig[attr];
    } else {
      orig = cur;
      el.__tvAttrOrig[attr] = orig;
    }
    const key = (orig || "").trim();
    if (key) attrPending.push({ el, attr, orig, key });
  }

  // ---- translate unique strings (cached + concurrency-limited) ----
  const uniq = [...new Set([...pending, ...attrPending].map((p) => p.key))];
  if (uniq.length === 0) return;
  const map = {};
  await pool(uniq, 6, async (t) => {
    map[t] = await translateText(t, base);
  });

  // ---- apply (guarded so we don't loop the observer) ----
  writing = true;
  try {
    for (const { n, orig, key } of pending) {
      const tr = map[key];
      if (!tr || tr === key) continue;
      const newValue = orig.replace(key, tr);
      if (n.nodeValue !== newValue) n.nodeValue = newValue;
      n.__tvTranslated = newValue;
      n.__tvLang = base;
    }
    for (const { el, attr, orig, key } of attrPending) {
      const tr = map[key];
      if (!tr || tr === key) continue;
      const newValue = orig.replace(key, tr);
      if (el.getAttribute(attr) !== newValue) el.setAttribute(attr, newValue);
      if (!el.__tvAttrTranslated) el.__tvAttrTranslated = {};
      el.__tvAttrTranslated[attr] = newValue;
      el.__tvAttrLang = base;
    }
  } finally {
    writing = false;
  }
}

/**
 * setupAutoTranslate(root, lang): translates `root` now and keeps it translated
 * as content changes. Returns a cleanup function (call on unmount / re-run).
 */
export function setupAutoTranslate(root, lang) {
  if (!root) return () => {};
  const base = (lang || "en").split("-")[0];

  // Initial pass.
  translateSubtree(root, base);

  if (base === "en") {
    // Nothing to keep translated; English is the source.
    return () => {};
  }

  let timer = null;
  const observer = new MutationObserver(() => {
    if (writing) return; // ignore our own writes
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => translateSubtree(root, base), 200);
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });

  return () => {
    if (timer) clearTimeout(timer);
    observer.disconnect();
  };
}
