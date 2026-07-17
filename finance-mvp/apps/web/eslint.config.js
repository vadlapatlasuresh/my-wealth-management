// Minimal lint config — one job: catch references to things that don't exist.
//
// WHY THIS EXISTS: `setRoleNotice is not defined` reached production. Vite/Rollup do not fail on
// an undefined identifier — it builds, deploys, and then throws a ReferenceError the first time a
// user clicks the thing. That is exactly what happened when a state variable was removed and one
// caller was left behind: the ops customer search rendered fine and blew up on click.
//
// Deliberately NOT a style config. No formatting rules, no opinions, no 500-warning wall that
// everyone learns to ignore. `no-undef` is the rule that would have caught a real production bug,
// so it is the rule that runs — and the codebase is clean under it today, which is what makes it
// worth keeping green.
//
// Run: npm run lint
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    files: ["src/**/*.{js,jsx}"],
    // The codebase carries `eslint-disable-next-line react-hooks/exhaustive-deps` comments from
    // before there was a config. Registering the plugin makes those resolve to a real rule (an
    // unknown rule in a disable comment is itself an error), and switching off the
    // unused-directive report keeps them quiet while the rule stays off. Turning
    // exhaustive-deps ON is a separate, worthwhile piece of work — not something to smuggle in
    // behind a bug fix.
    plugins: { "react-hooks": reactHooks },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        // Vite injects these at build time.
        process: "readonly"
      }
    },
    rules: {
      "no-undef": "error"
    }
  },
  {
    // Vitest files get the test globals.
    files: ["src/**/*.test.{js,jsx}"],
    languageOptions: {
      globals: { ...globals.node, describe: "readonly", it: "readonly", expect: "readonly",
                 vi: "readonly", beforeEach: "readonly", afterEach: "readonly" }
    }
  }
];
