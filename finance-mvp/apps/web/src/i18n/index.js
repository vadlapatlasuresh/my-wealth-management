// i18n/index.js
// -----------------------------------------------------------------------------
// Internationalization setup.
//
// Library choices (these are the "auto-select" pieces the request asked for):
//   - i18next ............................. the translation engine
//   - react-i18next ....................... React bindings (useTranslation, <Trans>)
//   - i18next-browser-languagedetector .... AUTO-DETECTS the user's language from
//        (in order) a saved choice (localStorage), the <html lang> attribute,
//        and the browser's navigator.language(s). No manual selection required.
//
// Bundled languages ship with full chrome translations. Anything not in the
// bundle falls back to English, and — if an auto-translate endpoint is configured
// (see ./autoTranslate.js) — missing strings are machine-translated on the fly
// and cached. With no endpoint configured the app still works perfectly in
// English + the bundled languages.
// -----------------------------------------------------------------------------

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import pt from "./locales/pt.json";
import zh from "./locales/zh.json";
import hi from "./locales/hi.json";
import ja from "./locales/ja.json";
import ar from "./locales/ar.json";

import { translateText, isAutoTranslateEnabled } from "./autoTranslate";

// Supported UI languages. `dir` flags right-to-left scripts (Arabic).
export const SUPPORTED_LANGUAGES = [
  { code: "en", labelKey: "language.en", dir: "ltr" },
  { code: "es", labelKey: "language.es", dir: "ltr" },
  { code: "fr", labelKey: "language.fr", dir: "ltr" },
  { code: "de", labelKey: "language.de", dir: "ltr" },
  { code: "pt", labelKey: "language.pt", dir: "ltr" },
  { code: "zh", labelKey: "language.zh", dir: "ltr" },
  { code: "hi", labelKey: "language.hi", dir: "ltr" },
  { code: "ja", labelKey: "language.ja", dir: "ltr" },
  { code: "ar", labelKey: "language.ar", dir: "rtl" },
];

const RTL_LANGS = new Set(
  SUPPORTED_LANGUAGES.filter((l) => l.dir === "rtl").map((l) => l.code)
);

const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  zh: { translation: zh },
  hi: { translation: hi },
  ja: { translation: ja },
  ar: { translation: ar },
};

// Set <html dir> and lang so RTL languages mirror the layout correctly.
export function applyDirection(lng) {
  try {
    const base = (lng || "en").split("-")[0];
    const dir = RTL_LANGS.has(base) ? "rtl" : "ltr";
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", base);
  } catch {
    /* SSR / no document — non-fatal */
  }
}

// When an auto-translate endpoint is configured, fill missing keys at runtime by
// machine-translating the English source, caching the result back into the i18n
// store so subsequent renders are instant. No-op when no endpoint is set.
function handleMissingKey(lngs, _ns, key, fallbackValue) {
  if (!isAutoTranslateEnabled()) return;
  const lng = Array.isArray(lngs) ? lngs[0] : lngs;
  const base = (lng || "en").split("-")[0];
  if (base === "en") return;
  const source = fallbackValue || en[key] || key;
  translateText(source, base).then((translated) => {
    if (translated && translated !== key) {
      i18n.addResource(base, "translation", key, translated);
    }
  });
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    nonExplicitSupportedLngs: true, // en-US -> en
    load: "languageOnly",
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      // Auto-detection order — saved choice wins, then markup, then the browser.
      order: ["localStorage", "htmlTag", "navigator"],
      lookupLocalStorage: "tv_lang",
      caches: ["localStorage"],
    },
    saveMissing: isAutoTranslateEnabled(),
    missingKeyHandler: handleMissingKey,
    returnNull: false,
    react: {
      useSuspense: false, // resources are bundled & synchronous; avoid suspense
      bindI18nStore: "added", // re-render when addResource fills a translation
    },
  });

// Apply direction now and whenever the language changes.
applyDirection(i18n.language);
i18n.on("languageChanged", applyDirection);

export function setLanguage(code) {
  return i18n.changeLanguage(code);
}

export function currentLanguage() {
  return (i18n.language || "en").split("-")[0];
}

export default i18n;
