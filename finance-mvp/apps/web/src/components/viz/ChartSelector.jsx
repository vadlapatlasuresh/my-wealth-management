import React from "react";
import { useChartPref } from "../../utils/chartPrefs";

/* ChartSelector — the shared chart-type switcher used by every chart surface (reference:
   IMG_1738 "Chart" sheet with Sankey / Bar / Profit & Loss + a "Split by business" toggle,
   and the Reports "Chart / Display by" dropdowns).

   It reads and writes the SHARED per-section preference (utils/chartPrefs), so changing the
   type on one screen propagates to every screen bound to the same `section`. The active pill
   carries the brand accent indicator; an optional Split-by-business toggle and a free-form
   "Display by" dropdown round out the controls.

   Props:
     section:     chartPrefs section id (e.g. "cashflow") — drives which types are offered
     split:       optional boolean (controlled Split-by-business)
     onSplit:     optional (bool)=>void — renders the toggle when provided
     displayBy:   optional { value, options:[{id,label}], onChange } — renders the dropdown
     compact:     smaller paddings for card headers
*/
export default function ChartSelector({ section, split, onSplit, displayBy, compact = false }) {
  const [type, setType, allowed] = useChartPref(section);

  return (
    <div className={`chart-selector ${compact ? "compact" : ""}`}>
      <div className="chart-switch" role="tablist" aria-label="Chart type">
        {allowed.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={type === t.id}
            className={`chart-switch-pill ${type === t.id ? "active" : ""}`}
            onClick={() => setType(t.id)}
            title={t.label}
          >
            <i className={t.icon} aria-hidden="true" />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {onSplit && (
        <label className="chart-toggle">
          <span>Split by business</span>
          <button
            type="button"
            role="switch"
            aria-checked={!!split}
            className={`switch ${split ? "on" : ""}`}
            onClick={() => onSplit(!split)}
          >
            <span className="knob" />
          </button>
        </label>
      )}

      {displayBy && (
        <label className="chart-displayby">
          <span className="lbl">Display by</span>
          <select value={displayBy.value} onChange={(e) => displayBy.onChange(e.target.value)}>
            {displayBy.options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
