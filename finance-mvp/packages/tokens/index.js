/**
 * @terravest/tokens — design tokens, single source of truth.
 *
 * Web consumers: use `cssVars(themeName)` to (re)generate the CSS-variable map
 * that drives apps/web/src/styles/terravest-theme.css (:root + data-theme blocks).
 *
 * Native (React Native / Expo) consumers: import the JSON directly, e.g.
 *   import tokens, { getTheme } from '@terravest/tokens';
 *   const { forest, gold } = getTheme('light').color;
 * There is no CSS on native — read the raw values from the same tokens.json so
 * web and native never drift.
 */
const tokens = require('./tokens.json');

const THEMES = ['light', 'dark', 'glass'];

/**
 * Return a normalized theme bundle: color + the theme-specific shadow set,
 * plus the shared spacing/radius/typography scales.
 * @param {'light'|'dark'|'glass'} name
 */
function getTheme(name = 'light') {
  if (!tokens.color[name]) {
    throw new Error(
      `Unknown theme "${name}". Available: ${Object.keys(tokens.color).join(', ')}`
    );
  }
  return {
    name,
    color: tokens.color[name],
    shadow: tokens.shadow[name] || tokens.shadow.light,
    spacing: tokens.spacing,
    radius: tokens.radius,
    typography: tokens.typography,
  };
}

// camelCase -> kebab-case (forestMid -> forest-mid)
function kebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Return the CSS-variable map for a theme, matching the names used in
 * terravest-theme.css. Web can use this to regenerate the :root /
 * html[data-theme="..."] blocks so the CSS stays in sync with tokens.json.
 *
 * Mapping: color keys -> --tv-<kebab>, radius -> --radius-<key>,
 * shadows -> --shadow-<key>, fonts -> --font-display/--font-body,
 * displayWeight -> --display-weight, sidebarW -> --sidebar-w.
 *
 * @param {'light'|'dark'|'glass'} themeName
 * @returns {Record<string,string|number>}
 */
function cssVars(themeName = 'light') {
  const theme = getTheme(themeName);
  const vars = {};

  for (const [key, value] of Object.entries(theme.color)) {
    vars[`--tv-${kebab(key)}`] = value;
  }
  for (const [key, value] of Object.entries(theme.radius)) {
    vars[`--radius-${key}`] = value;
  }
  for (const [key, value] of Object.entries(theme.shadow)) {
    vars[`--shadow-${key}`] = value;
  }

  vars['--font-display'] = tokens.typography.fonts.display;
  vars['--font-body'] = tokens.typography.fonts.body;
  vars['--display-weight'] = tokens.typography.displayWeight;
  vars['--sidebar-w'] = tokens.spacing.sidebarW;

  return vars;
}

/** Serialize cssVars() into a CSS block body (one `--var: value;` per line). */
function cssVarsBlock(themeName = 'light') {
  return Object.entries(cssVars(themeName))
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
}

module.exports = tokens;
module.exports.tokens = tokens;
module.exports.THEMES = THEMES;
module.exports.getTheme = getTheme;
module.exports.cssVars = cssVars;
module.exports.cssVarsBlock = cssVarsBlock;
module.exports.default = tokens;
