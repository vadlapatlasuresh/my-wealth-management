import { useEffect, useState } from "react";

/**
 * Renders a legal markdown doc (served from /public/legal/*.md) in a modal. Works
 * pre-login (it's just a fetch + render, no auth) so the signup screen can link to it,
 * and post-login from Settings. Tiny built-in markdown rendering (headings / lists /
 * blockquote / bold / code) keeps it dependency-free.
 *
 * Props: doc = "terms-of-service" | "privacy-policy"; onClose().
 */
const TITLES = {
  "terms-of-service": "Terms of Service",
  "privacy-policy": "Privacy Policy",
};

function renderMarkdown(md) {
  const lines = md.split("\n");
  const out = [];
  let list = null;
  const inline = (s) =>
    s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.+?)`/g, '<code>$1</code>');
  const flushList = () => { if (list) { out.push(`<ul>${list}</ul>`); list = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^### /.test(line)) { flushList(); out.push(`<h3>${inline(line.slice(4))}</h3>`); }
    else if (/^## /.test(line)) { flushList(); out.push(`<h2>${inline(line.slice(3))}</h2>`); }
    else if (/^# /.test(line)) { flushList(); out.push(`<h1>${inline(line.slice(2))}</h1>`); }
    else if (/^> /.test(line)) { flushList(); out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`); }
    else if (/^[-*] /.test(line)) { list = (list || "") + `<li>${inline(line.slice(2))}</li>`; }
    else if (line === "") { flushList(); }
    else { flushList(); out.push(`<p>${inline(line)}</p>`); }
  }
  flushList();
  return out.join("");
}

export default function LegalDoc({ doc, onClose }) {
  const [html, setHtml] = useState("");
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/legal/${doc}.md`)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => { if (!cancelled) setHtml(renderMarkdown(t)); })
      .catch(() => { if (!cancelled) setErr(true); });
    return () => { cancelled = true; };
  }, [doc]);

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(17,29,23,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div className="card legal-doc" style={{ width: "100%", maxWidth: 760, maxHeight: "88vh", overflowY: "auto", padding: "24px 28px" }} role="dialog" aria-modal="true">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 className="page-title" style={{ fontSize: 22, margin: 0 }}>{TITLES[doc] || "Legal"}</h2>
          <button className="icon-btn" onClick={onClose} title="Close"><i className="ti ti-x"></i></button>
        </div>
        {err
          ? <p style={{ color: "var(--tv-text-secondary)" }}>Could not load this document.</p>
          : <div className="legal-body" dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
    </div>
  );
}
