/* App theme — TWO independent axes, both persisted to localStorage and applied as
   attributes on <html> (the CSS in terravest-theme.css does the rest):

     • MODE  (data-theme):  glass-dark | light | dark | glass
         glass-dark is the product default (dark glassmorphism). It was re-tuned to be
         noticeably LIGHTER / higher-contrast than before (surfaces + text) so screens no
         longer read as "too dark".
     • BACKGROUND (data-bg): the canvas colour — one of 6 palettes. Each palette renders a
         mode-appropriate tint (a dark tint in dark modes, a light tint in light mode), so the
         SAME swatch works whether you're in dark or light. Default: "slate" (a balanced,
         lighter slate-blue — the new brighter starting point).

   Splitting mode from background is what lets the global Theme control offer a Dark/Light
   toggle AND a 6-colour background picker without a combinatorial explosion. */

// Glass is now the ONLY theme family — a Dark variant (glass-dark, the default) and a Light
// variant (glass). Legacy values ("light"/"dark") are no longer valid, so getTheme() migrates
// those users onto the Glass default on next load.
export const THEMES = ["glass-dark", "glass"];
export const DEFAULT_THEME = "glass-dark";

export const THEME_META = {
  "glass-dark": { label: "Glass · Dark", icon: "ti ti-moon" },
  glass: { label: "Glass · Light", icon: "ti ti-sun" },
};

/* Background palettes. `swatch` is the colour shown in the picker (its dark-mode canvas),
   `light` is the swatch when the app is in light mode. Names follow the requested palette:
   slate blue, deep navy, charcoal, forest green, warm cream, soft white. */
export const BACKGROUNDS = [
  { id: "slate", label: "Slate Blue", swatch: "#1B2636", light: "#EEF2F7" },
  { id: "navy", label: "Deep Navy", swatch: "#111A2E", light: "#E7ECF6" },
  { id: "graphite", label: "Charcoal", swatch: "#191B1F", light: "#EDEEF0" },
  { id: "forest", label: "Forest Green", swatch: "#122019", light: "#E9F1EB" },
  { id: "cream", label: "Warm Cream", swatch: "#221D16", light: "#F6EFE1" },
  { id: "mist", label: "Soft White", swatch: "#1C222B", light: "#F4F7FA" },
];
export const DEFAULT_BG = "slate";

const isLightMode = (theme) => theme === "glass"; // Glass · Light is the light variant

export function getTheme() {
  const t = localStorage.getItem("tv_theme");
  return THEMES.includes(t) ? t : DEFAULT_THEME;
}

export function applyTheme(t) {
  const theme = THEMES.includes(t) ? t : DEFAULT_THEME;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("tv_theme", theme);
  return theme;
}

export function getBg() {
  const b = localStorage.getItem("tv_bg");
  return BACKGROUNDS.some((x) => x.id === b) ? b : DEFAULT_BG;
}

export function applyBg(id) {
  const bg = BACKGROUNDS.some((x) => x.id === id) ? id : DEFAULT_BG;
  document.documentElement.setAttribute("data-bg", bg);
  localStorage.setItem("tv_bg", bg);
  return bg;
}

/* Convenience: is the app currently in a "light" mode? Used by the Theme control to show
   the correct swatch colours. */
export function isLight() {
  return isLightMode(getTheme());
}

export function nextTheme(t) {
  const i = THEMES.indexOf(t);
  return THEMES[(i + 1) % THEMES.length];
}
