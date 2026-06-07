import type { CapacitorConfig } from '@capacitor/cli';

/**
 * TerraVest — Capacitor configuration.
 *
 * We chose the CAPACITOR path: the existing Vite web UI under apps/web is the
 * single codebase, wrapped for iOS/Android. No separate native UI codebase.
 *
 * ── One-time setup ─────────────────────────────────────────────────────────
 *   # from apps/web
 *   npm i -D @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
 *   npx cap init "TerraVest" "com.terravest.app" --web-dir=dist
 *   # (already configured by this file — `cap init` is for reference)
 *
 * ── Build + sync loop ──────────────────────────────────────────────────────
 *   npm run build -w apps/web      # produce apps/web/dist (webDir below)
 *   npx cap add ios                # one-time, creates apps/web/ios
 *   npx cap add android            # one-time, creates apps/web/android
 *   npx cap sync                   # copy web build + plugins into native projects
 *   npx cap open ios               # open Xcode  (build/run/sign)
 *   npx cap open android           # open Android Studio
 *
 * ── Native plugins → features (install + add to package, then `cap sync`) ───
 *   Push notifications  : @capacitor/push-notifications  (notification-service)
 *   Token/secure storage: @capacitor/preferences  (or a secure-storage plugin)
 *   Biometric unlock    : optional biometric plugin (e.g. capacitor-native-biometric)
 *   See DEPLOYMENT.md for the full plugin → feature matrix.
 */
const config: CapacitorConfig = {
  appId: 'com.terravest.app',
  appName: 'TerraVest',
  webDir: 'dist',

  // ── Live-reload during development ─────────────────────────────────────────
  // Uncomment and point `url` at your machine's LAN IP running the Vite dev
  // server (`npm run dev -w apps/web`), then `npx cap sync` and run on device.
  // Re-comment (and rebuild) before producing a release build.
  // server: {
  //   url: 'http://192.168.1.100:5173',
  //   cleartext: true,
  // },

  ios: {
    contentInset: 'always',
  },
  android: {
    // The Android WebView serves the app over https://localhost. Allowing mixed
    // content lets it call an http:// backend during local development
    // (e.g. http://10.0.2.2:8080). In PRODUCTION your gateway should be HTTPS,
    // and you can set this back to false.
    allowMixedContent: true,
  },
};

export default config;
