import { useEffect, useRef, useState } from "react";
import { getTheme, applyTheme, getBg, applyBg, BACKGROUNDS } from "../theme";

/* ThemeControl — a globally-accessible floating theme switcher (not buried in Settings).
   Two independent axes, both persisted by theme.js (localStorage):
     • MODE:       Light ↔ Dark  (dark = the lightened glass-dark default)
     • BACKGROUND: a 6-colour palette; each swatch shows a mode-appropriate tint.
   Mounted once in AppLayout so it's reachable from every screen. */
export default function ThemeControl() {
  const [open, setOpen] = useState(false);
  // `theme` here is only the light/dark axis for THIS control; the app also supports
  // dark/glass via the topbar cycler, but the picker maps to the two most-used modes.
  const [theme, setTheme] = useState(getTheme());
  const [bg, setBg] = useState(getBg());
  const ref = useRef(null);

  // Both variants are Glass; "light" here means the Glass · Light variant.
  const isLightMode = theme === "glass";

  // Close on outside-click / Escape (accessible + expected for a popover).
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const setMode = (light) => {
    const next = light ? "glass" : "glass-dark"; // Glass · Light / Glass · Dark
    setTheme(applyTheme(next));
  };
  const setBackground = (id) => setBg(applyBg(id));

  return (
    <div ref={ref}>
      <button
        className="theme-fab"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Theme and background"
        title="Theme & background"
        onClick={() => setOpen((o) => !o)}
      >
        <i className={isLightMode ? "ti ti-sun" : "ti ti-moon"} />
      </button>

      {open && (
        <div className="theme-pop" role="dialog" aria-label="Theme settings">
          <h4>Glass mode</h4>
          <div className="theme-mode">
            <button className={isLightMode ? "" : "on"} onClick={() => setMode(false)} aria-pressed={!isLightMode}>
              <i className="ti ti-moon" /> Dark
            </button>
            <button className={isLightMode ? "on" : ""} onClick={() => setMode(true)} aria-pressed={isLightMode}>
              <i className="ti ti-sun" /> Light
            </button>
          </div>

          <h4>Background</h4>
          <div className="theme-swatches">
            {BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                className={`theme-swatch ${bg === b.id ? "on" : ""}`}
                style={{ background: isLightMode ? b.light : b.swatch }}
                onClick={() => setBackground(b.id)}
                aria-label={b.label}
                aria-pressed={bg === b.id}
                title={b.label}
              />
            ))}
          </div>
          <div className="theme-swatch-labels">
            <span>Slate</span><span>Navy</span><span>Charcoal</span><span>Forest</span><span>Cream</span><span>Soft</span>
          </div>
        </div>
      )}
    </div>
  );
}
