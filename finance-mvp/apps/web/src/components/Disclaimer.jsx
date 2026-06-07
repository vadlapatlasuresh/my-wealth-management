import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchDisclaimers, acceptDisclaimer } from "../content/contentClient";

/* ---- markdown-lite: **bold**, _italic_, paragraphs/line breaks, "- " bullets ---- */
function inlineMarkup(str, keyBase) {
  const out = [];
  let rem = String(str);
  const re = /(\*\*([^*]+)\*\*|_([^_]+)_)/;
  let k = 0;
  let m;
  while ((m = rem.match(re)) !== null) {
    const idx = m.index;
    if (idx > 0) out.push(rem.slice(0, idx));
    if (m[2] != null) out.push(<strong key={`${keyBase}-b${k++}`}>{m[2]}</strong>);
    else
      out.push(
        <em key={`${keyBase}-i${k++}`} style={{ fontStyle: "italic" }}>
          {m[3]}
        </em>
      );
    rem = rem.slice(idx + m[0].length);
  }
  if (rem) out.push(rem);
  return out;
}

function RichText({ text }) {
  const lines = String(text || "").split("\n");
  const blocks = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} style={{ margin: "4px 0", paddingLeft: 18 }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: 3 }}>
              {inlineMarkup(b, `b${blocks.length}-${i}`)}
            </li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (t.startsWith("- ")) bullets.push(t.slice(2));
    else {
      flush();
      if (t === "") blocks.push(<div key={`sp${i}`} style={{ height: 6 }} />);
      else blocks.push(<div key={`l${i}`}>{inlineMarkup(ln, `l${i}`)}</div>);
    }
  });
  flush();
  return <>{blocks}</>;
}

function Skeleton({ variant }) {
  const bar = (w, h = 10) => (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 6,
        background: "var(--tv-border-light)",
        opacity: 0.8,
      }}
    />
  );
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        animation: "tvDisclaimerPulse 1.2s ease-in-out infinite",
      }}
    >
      <style>{`@keyframes tvDisclaimerPulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }`}</style>
      {variant !== "inline" && bar("40%", 12)}
      {bar("100%")}
      {variant !== "inline" && bar("85%")}
    </div>
  );
}

const ackKey = (key, version) => `tv_disclaimer_ack_${key}_${version}`;

function wasAcknowledged(key, version) {
  try {
    return localStorage.getItem(ackKey(key, version)) === "1";
  } catch {
    return false;
  }
}

/**
 * DB/CMS-driven disclaimer. Renders versioned content from the content API with a
 * safe hard-coded fallback so the screen is never empty or broken.
 *
 * Props:
 *  - keyId: disclaimer key (e.g. "ai.assistant")
 *  - fallbackTitle / fallbackBody: shown when the API has nothing
 *  - variant: "card" | "inline" | "warning"
 *  - locale: defaults to "en"
 */
export default function Disclaimer({
  keyId,
  fallbackTitle = "",
  fallbackBody = "",
  variant = "card",
  locale,
}) {
  const { t, i18n } = useTranslation();
  // Localize DB content to the active UI language unless a locale is forced.
  const activeLocale = locale || (i18n.language || "en").split("-")[0];
  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState(null);
  const [acked, setAcked] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchDisclaimers([keyId], activeLocale)
      .then((map) => {
        if (!active) return;
        const found = (map && map[keyId]) || null;
        setItem(found);
        if (found) setAcked(wasAcknowledged(found.key, found.version));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [keyId, activeLocale]);

  const title = item ? item.title : fallbackTitle;
  const body = item ? item.bodyMarkdown : fallbackBody;
  const requiresAcceptance = !!(item && item.requiresAcceptance);
  const showAck = requiresAcceptance && !acked;

  const handleAccept = () => {
    setAcked(true); // optimistic — hide the prompt immediately
    try {
      localStorage.setItem(ackKey(item.key, item.version), "1");
    } catch {
      /* ignore */
    }
    acceptDisclaimer(item.key, item.version);
  };

  // Nothing to show at all (no API content, no fallback) — render nothing.
  if (!loading && !title && !body) return null;

  // ---- variant containers ----
  if (variant === "inline") {
    return (
      <div
        style={{
          fontSize: "11.5px",
          color: "var(--tv-text-muted)",
          lineHeight: 1.5,
          marginTop: 6,
        }}
      >
        {loading ? (
          <Skeleton variant="inline" />
        ) : (
          <>
            {title ? <strong style={{ marginRight: 4 }}>{title}</strong> : null}
            <RichText text={body} />
            {showAck && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 6 }}
                onClick={handleAccept}
              >
                {t("disclaimer.iUnderstand", "I understand")}
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  if (variant === "warning") {
    return (
      <div
        className="card"
        style={{
          background: "var(--tv-warning-bg)",
          borderLeft: "4px solid var(--tv-warning)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <i
            className="ti ti-alert-triangle"
            style={{ fontSize: "24px", color: "var(--tv-warning)", flexShrink: 0 }}
          ></i>
          <div style={{ flex: 1, fontSize: "12.5px", color: "var(--tv-warning)", lineHeight: 1.6 }}>
            {loading ? (
              <Skeleton variant="warning" />
            ) : (
              <>
                {title ? <strong style={{ display: "block", marginBottom: 4 }}>{title}</strong> : null}
                <RichText text={body} />
                {showAck && (
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 10 }}
                    onClick={handleAccept}
                  >
                    {t("disclaimer.iUnderstand", "I understand")}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // variant === "card" (default)
  return (
    <div className="card">
      {loading ? (
        <Skeleton variant="card" />
      ) : (
        <>
          {title ? (
            <div className="section-title" style={{ marginBottom: 8 }}>
              {title}
            </div>
          ) : null}
          <div style={{ fontSize: "13px", color: "var(--tv-text-secondary)", lineHeight: 1.6 }}>
            <RichText text={body} />
          </div>
          {showAck && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 12 }}
              onClick={handleAccept}
            >
              {t("disclaimer.iUnderstand", "I understand")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
