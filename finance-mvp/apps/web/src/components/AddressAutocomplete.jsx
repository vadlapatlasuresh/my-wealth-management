import React, { useEffect, useRef, useState, useCallback } from "react";

/*
 * Address input with autocomplete suggestions you can select from.
 *
 * Two modes (auto-detected):
 *  1. If VITE_GOOGLE_MAPS_API_KEY is set in apps/web/.env -> Google Places Autocomplete.
 *  2. Otherwise -> a free, no-key OpenStreetMap (Photon) autocomplete with a custom
 *     dropdown. This means address suggestions appear and are selectable out of the box.
 *
 * onSelect receives { address, components:{city,state,postalCode,country}, lat, lng }.
 */

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const PHOTON_URL = "https://photon.komoot.io/api/";
let googleLoader = null;

function loadGoogleMaps() {
  if (typeof window === "undefined" || !GOOGLE_KEY) return Promise.reject(new Error("no-key"));
  if (window.google?.maps?.places) return Promise.resolve(window.google);
  if (googleLoader) return googleLoader;
  googleLoader = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&libraries=places&loading=async`;
    s.async = true; s.defer = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => reject(new Error("google-maps-load-failed"));
    document.head.appendChild(s);
  });
  return googleLoader;
}

function photonLabel(p) {
  const line1 = [p.housenumber, p.street].filter(Boolean).join(" ") || p.name || "";
  const line2 = [p.city || p.county || p.district, p.state, p.postcode].filter(Boolean).join(", ");
  return [line1, line2, p.country].filter(Boolean).join(", ");
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing an address…",
  className = "form-input",
  required = false,
}) {
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const gAcRef = useRef(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const justSelectedRef = useRef(false);

  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  /* ---- Google mode ---- */
  useEffect(() => {
    if (!GOOGLE_KEY || !inputRef.current) return;
    let cancelled = false;
    loadGoogleMaps().then((google) => {
      if (cancelled || gAcRef.current || !inputRef.current) return;
      const ac = new google.maps.places.Autocomplete(inputRef.current, {
        types: ["address"],
        fields: ["formatted_address", "address_components", "geometry"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const address = place.formatted_address || inputRef.current.value;
        const c = { city: "", state: "", postalCode: "", country: "" };
        (place.address_components || []).forEach((x) => {
          if (x.types.includes("locality")) c.city = x.long_name;
          if (x.types.includes("administrative_area_level_1")) c.state = x.short_name;
          if (x.types.includes("postal_code")) c.postalCode = x.long_name;
          if (x.types.includes("country")) c.country = x.short_name;
        });
        onChange?.(address);
        onSelect?.({ address, components: c, lat: place.geometry?.location?.lat?.() ?? null, lng: place.geometry?.location?.lng?.() ?? null });
      });
      gAcRef.current = ac;
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [onChange, onSelect]);

  /* ---- Photon (free, no key) mode ---- */
  const fetchSuggestions = useCallback((q) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    fetch(`${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=6&lang=en`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const items = (data.features || [])
          .map((f) => ({
            label: photonLabel(f.properties),
            lat: f.geometry?.coordinates?.[1] ?? null,
            lng: f.geometry?.coordinates?.[0] ?? null,
            components: {
              city: f.properties.city || f.properties.county || "",
              state: f.properties.state || "",
              postalCode: f.properties.postcode || "",
              country: f.properties.country || "",
            },
          }))
          .filter((x) => x.label);
        setSuggestions(items);
        setOpen(items.length > 0);
        setActiveIdx(-1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (GOOGLE_KEY) return; // Google handles its own dropdown
    if (justSelectedRef.current) { justSelectedRef.current = false; return; }
    const q = (value || "").trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(() => fetchSuggestions(q), 280);
    return () => clearTimeout(debounceRef.current);
  }, [value, fetchSuggestions]);

  // Close on outside click
  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(s) {
    justSelectedRef.current = true;
    onChange?.(s.label);
    onSelect?.({ address: s.label, components: s.components, lat: s.lat, lng: s.lng });
    setOpen(false);
    setSuggestions([]);
  }

  function onKeyDown(e) {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); choose(suggestions[activeIdx]); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        ref={inputRef}
        className={className}
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => { if (!GOOGLE_KEY && suggestions.length) setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      {loading && !GOOGLE_KEY && (
        <i className="ti ti-loader spin" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--tv-text-muted)" }}></i>
      )}
      {open && !GOOGLE_KEY && suggestions.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 60,
          background: "var(--tv-white)", border: "1px solid var(--tv-border)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}>
          {suggestions.map((s, i) => (
            <div
              key={i}
              onMouseDown={(e) => { e.preventDefault(); choose(s); }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer",
                background: i === activeIdx ? "var(--tv-sage-pale)" : "transparent",
                borderBottom: i < suggestions.length - 1 ? "1px solid var(--tv-border-light)" : "none",
              }}
            >
              <i className="ti ti-map-pin" style={{ color: "var(--tv-forest-light)", fontSize: 15, flexShrink: 0 }}></i>
              <span style={{ fontSize: 13, color: "var(--tv-text-primary)" }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const GOOGLE_MAPS_ENABLED = !!GOOGLE_KEY;
