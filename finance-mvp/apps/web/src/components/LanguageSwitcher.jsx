import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, setLanguage, currentLanguage } from "../i18n";

// Topbar language picker. The active language is auto-detected on first load
// (browser language) and remembered in localStorage thereafter, so this control
// is only needed to override the automatic choice.
export default function LanguageSwitcher() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [lng, setLng] = useState(currentLanguage());
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function choose(code) {
    setLanguage(code);
    setLng(code);
    setOpen(false);
  }

  const active =
    SUPPORTED_LANGUAGES.find((l) => l.code === lng) || SUPPORTED_LANGUAGES[0];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="icon-btn"
        onClick={() => setOpen((s) => !s)}
        title={t("language.label")}
        aria-label={t("language.label")}
        style={{ gap: 6, display: "inline-flex", alignItems: "center", width: "auto", padding: "0 10px" }}
      >
        <i className="ti ti-language"></i>
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase" }}>
          {active.code}
        </span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 40,
            width: 190,
            background: "var(--tv-white)",
            border: "1px solid var(--tv-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 60,
            overflow: "hidden",
            padding: "4px",
          }}
        >
          <div
            style={{
              padding: "8px 10px 4px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".04em",
              textTransform: "uppercase",
              color: "var(--tv-text-muted, #888)",
            }}
          >
            {t("language.label")}
          </div>
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => choose(l.code)}
              className="list-item"
              style={{
                width: "100%",
                textAlign: "start",
                border: "none",
                background: l.code === lng ? "var(--tv-border-light, #f3f3f3)" : "transparent",
                borderRadius: "var(--radius-md, 8px)",
                cursor: "pointer",
                padding: "8px 10px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                font: "inherit",
                color: "inherit",
              }}
            >
              <span style={{ flex: 1 }}>{t(l.labelKey)}</span>
              {l.code === lng && <i className="ti ti-check" style={{ color: "var(--tv-forest-light)" }}></i>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
