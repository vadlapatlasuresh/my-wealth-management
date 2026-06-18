import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
const STORAGE_KEY = "terravest_session_timeout";

/** The configured idle window in minutes, clamped to the allowed 5..30 (default 5). */
export function getSessionTimeoutMinutes() {
  const n = Number(localStorage.getItem(STORAGE_KEY));
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.max(5, Math.min(30, Math.round(n)));
}

/** Persist the user's chosen idle window (so the timer picks it up immediately). */
export function setSessionTimeoutMinutes(minutes) {
  localStorage.setItem(STORAGE_KEY, String(Math.max(5, Math.min(30, Math.round(minutes)))));
}

/**
 * Auto-logout after a period of inactivity (industry-standard for finance apps).
 * Active only while `active` (i.e. signed in). Resets on any user activity; fires
 * `onIdle` after the configured window. The callback is read through a ref so the
 * timer isn't torn down/reset on every parent re-render.
 */
export default function useIdleLogout(active, onIdle) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;
  const timerRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(
        () => onIdleRef.current && onIdleRef.current(),
        getSessionTimeoutMinutes() * 60 * 1000
      );
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [active]);
}
