import { useEffect, useRef, useState } from "react";
import { api } from "../api";

/**
 * Social sign-in buttons (Google now; Apple slot ready). Entirely self-configuring:
 * it asks the backend which providers are enabled (/oauth/config) and only renders a
 * button when that provider has a client id set. With no keys configured it renders
 * nothing — so the login screen is unchanged until you turn social login on.
 *
 * Flow: Google Identity Services returns an ID token in the browser -> we POST it to
 * /oauth/google -> backend verifies + returns our JWT -> onAuthenticated(response),
 * the same handler password login uses.
 *
 * Props:
 *   onAuthenticated  (response) => Promise  — receives { token, email, name }
 *   onError          (message) => void
 */
const GIS_SRC = "https://accounts.google.com/gsi/client";

export default function SocialLogin({ onAuthenticated, onError }) {
  const [cfg, setCfg] = useState(null);
  const googleBtnRef = useRef(null);

  // Discover which providers are enabled.
  useEffect(() => {
    let cancelled = false;
    api.getOAuthConfig()
      .then((c) => { if (!cancelled) setCfg(c); })
      .catch(() => { if (!cancelled) setCfg({ google: false, apple: false }); });
    return () => { cancelled = true; };
  }, []);

  // Initialize Google Identity Services once we know the client id.
  useEffect(() => {
    if (!cfg?.google || !cfg.googleClientId) return undefined;
    let cancelled = false;

    const init = () => {
      if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: cfg.googleClientId,
        callback: async ({ credential }) => {
          try {
            const res = await api.oauthGoogle(credential);
            if (res?.token) await onAuthenticated(res);
            else onError?.((res && res.message) || "Google sign-in failed.");
          } catch (e) {
            onError?.((e && e.message) || "Google sign-in failed.");
          }
        },
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: "outline", size: "large", width: 320, text: "continue_with",
      });
    };

    // Load the GIS script once, then init.
    let script = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (window.google?.accounts?.id) {
      init();
    } else if (script) {
      script.addEventListener("load", init, { once: true });
    } else {
      script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", init, { once: true });
      document.head.appendChild(script);
    }
    return () => { cancelled = true; };
  }, [cfg, onAuthenticated, onError]);

  if (!cfg || (!cfg.google && !cfg.apple)) return null;

  return (
    <div className="social-login">
      <div className="social-divider"><span>or continue with</span></div>
      {cfg.google && <div ref={googleBtnRef} className="social-google" />}
      {cfg.apple && (
        <button type="button" className="btn social-apple" disabled title="Apple sign-in coming soon">
          <i className="ti ti-brand-apple"></i> Continue with Apple
        </button>
      )}
    </div>
  );
}
