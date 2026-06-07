/* App theme: light | dark | glass. Applied via data-theme on <html>;
   the CSS variable overrides in terravest-theme.css do the rest. */
export const THEMES = ["light", "dark", "glass"];

export const THEME_META = {
  light: { label: "Light", icon: "ti ti-sun" },
  dark: { label: "Dark", icon: "ti ti-moon" },
  glass: { label: "Glass", icon: "ti ti-sparkles" },
};

export function getTheme() {
  const t = localStorage.getItem("tv_theme");
  return THEMES.includes(t) ? t : "light";
}

export function applyTheme(t) {
  const theme = THEMES.includes(t) ? t : "light";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("tv_theme", theme);
  return theme;
}

export function nextTheme(t) {
  const i = THEMES.indexOf(t);
  return THEMES[(i + 1) % THEMES.length];
}
