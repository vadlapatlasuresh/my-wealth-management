import { useEffect, useMemo, useRef, useState } from "react";
import { SECTIONS, SCREENS, renderScreen } from "../utils/studioModel";

/* VisualizationStudioPage — the in-app port of assets/terravest-design-studio.html.
   Everything from the standalone Studio is carried over 1:1:
     • ONE source of truth (SCREENS, in utils/studioModel.js) drives synced Web/iOS/Android
     • grouped, colour-coded section navigator + breadcrumb (identifiability)
     • a live in-place code editor: edit a screen's JSON spec → all 3 panels update
     • a real-time "sync" pulse + a toolbar (Format / Reset / Add card block)
   Here React's own state IS the reactive store (the observable pattern from the HTML file
   maps directly onto useState + a single render). Rendered at BOTH /flowmap and
   /visualization (see moduleRegistry + AppLayout). It reuses the app's `.viz-*` styles and
   theme tokens, so it re-themes with the global Theme control automatically.

   The data model + string renderers live in utils/studioModel.js so they're unit-testable
   without a DOM (see studioModel.test.js); this file is the thin React shell over them. */

/* deep clone so "Reset" restores pristine defaults without sharing references */
const clone = (o) => JSON.parse(JSON.stringify(o));

export default function VisualizationStudioPage() {
  // React state IS the reactive store — one setState re-renders every panel in sync.
  const [screens, setScreens] = useState(() => clone(SCREENS));
  const [activeId, setActiveId] = useState("yearinreview");
  const [code, setCode] = useState(() => JSON.stringify(clone(SCREENS).yearinreview.blocks, null, 2));
  const [status, setStatus] = useState({ ok: true, msg: "Valid · synced" });
  const [pulse, setPulse] = useState(0);
  const debounce = useRef(null);

  const active = screens[activeId];
  const html = useMemo(() => renderScreen(active), [active]);

  // When the active screen changes, load its spec into the editor (not on every keystroke,
  // so the cursor never jumps). Edits flow the other way in onCodeChange.
  useEffect(() => {
    setCode(JSON.stringify(active.blocks, null, 2));
    setStatus({ ok: true, msg: "Valid · synced" });
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pulse the "in sync" dot whenever the rendered output changes.
  useEffect(() => { setPulse((p) => p + 1); }, [html]);

  // Live editing: debounced parse → update the active screen → all panels re-render.
  const onCodeChange = (value) => {
    setCode(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      try {
        const blocks = JSON.parse(value);
        if (!Array.isArray(blocks)) throw new Error("Spec must be an array of blocks");
        setStatus({ ok: true, msg: "Valid · synced" });
        setScreens((s) => ({ ...s, [activeId]: { ...s[activeId], blocks } }));
      } catch (err) {
        // Keep the last good visualization; just surface the error.
        setStatus({ ok: false, msg: "Invalid JSON — " + err.message });
      }
    }, 250);
  };

  const format = () => {
    try { setCode(JSON.stringify(JSON.parse(code), null, 2)); setStatus({ ok: true, msg: "Formatted" }); }
    catch { setStatus({ ok: false, msg: "Cannot format invalid JSON" }); }
  };
  const reset = () => {
    const blocks = clone(SCREENS[activeId].blocks);
    setScreens((s) => ({ ...s, [activeId]: { ...s[activeId], blocks } }));
    setCode(JSON.stringify(blocks, null, 2));
    setStatus({ ok: true, msg: "Reset to defaults" });
  };
  const addCard = () => {
    try {
      const blocks = JSON.parse(code);
      blocks.push({ type: "list", title: "New card", rows: [{ dot: "#3DDC97", label: "Edit me", sub: "in the code panel", val: "→" }] });
      setCode(JSON.stringify(blocks, null, 2));
      setScreens((s) => ({ ...s, [activeId]: { ...s[activeId], blocks } }));
      setStatus({ ok: true, msg: "Added a card block" });
    } catch { setStatus({ ok: false, msg: "Fix the JSON first" }); }
  };
  const onTab = (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.target, s = el.selectionStart;
      const v = el.value.slice(0, s) + "  " + el.value.slice(el.selectionEnd);
      setCode(v);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    }
  };

  // Group screens by section for the navigator.
  const groups = useMemo(() => {
    const g = {};
    Object.entries(screens).forEach(([id, s]) => { (g[s.section] = g[s.section] || []).push([id, s]); });
    return g;
  }, [screens]);

  const sec = SECTIONS[active.section];
  const Device = ({ label, cls, phone, android }) => (
    <div className="viz-device">
      <div className="viz-device-label"><span className="d" /> {label}</div>
      {phone ? (
        <div className={`viz-phone ${android ? "android" : ""}`}>
          <div className="viz-notch" />
          <div className="viz-screen" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      ) : (
        <div className={cls}>
          <div className="bar"><i /><i /><i /><span className="url">app.terravest.app</span></div>
          <div className="viz-screen" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  );

  return (
    <div className="page active">
      {/* Header + breadcrumb + real-time sync indicator */}
      <div className="viz-topbar">
        <div>
          <div className="page-title">Visualization Studio</div>
          <div className="page-subtitle">One source of truth · Web, iOS & Android stay in sync · edit the spec live.</div>
        </div>
        <div className="viz-sync" role="status" aria-live="polite">
          <span key={pulse} className="pulse on" /> In sync · 1 source of truth
        </div>
      </div>
      <div className="viz-crumb" style={{ marginBottom: 14 }}>
        <span className="dot" style={{ background: sec.color }} /> {sec.label} <span>›</span> <strong>{active.name}</strong>
      </div>

      <div className="viz">
        {/* LEFT — grouped section navigator */}
        <aside className="card viz-nav" aria-label="App sections and screens">
          {Object.keys(SECTIONS).filter((k) => groups[k]).map((k) => (
            <div key={k}>
              <h5>{SECTIONS[k].label}</h5>
              {groups[k].map(([id, s]) => (
                <button key={id} className="viz-nav-item" aria-current={activeId === id} onClick={() => setActiveId(id)}>
                  <span className="dot" style={{ background: SECTIONS[k].color }} />{s.name}
                  {s.isNew && <span className="new">NEW</span>}
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* CENTER — three synced device previews (same source) */}
        <section aria-label="Synced previews">
          <div className="viz-previews">
            <Device label="Web · Browser" cls="viz-web" />
            <Device label="iOS · iPhone" phone />
            <Device label="Android · Pixel" phone android />
          </div>
        </section>

        {/* RIGHT — live code editor */}
        <aside className="card viz-editor">
          <div className="viz-ehead"><span className="et">Screen spec</span><span className="hint">edits render live in all 3</span></div>
          <label className="sr-only" htmlFor="viz-code">Active screen JSON specification</label>
          <textarea id="viz-code" className="viz-code" spellCheck={false} value={code}
            onChange={(e) => onCodeChange(e.target.value)} onKeyDown={onTab} />
          <div className={`viz-estatus ${status.ok ? "ok" : "err"}`}><span className="badge">JSON</span>{status.msg}</div>
          <div className="viz-toolbar">
            <button className="btn btn-secondary btn-sm" onClick={format}>Format</button>
            <button className="btn btn-secondary btn-sm" onClick={reset}>Reset screen</button>
            <button className="btn btn-primary btn-sm" onClick={addCard}>+ Add card block</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
