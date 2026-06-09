import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// TerraVest web build.
// vite-plugin-pwa makes the app installable on iOS (Safari → Add to Home Screen)
// and Android (Chrome → Install app), and adds an offline-capable service worker.
// The SW is disabled in dev (devOptions.enabled=false) so it never interferes
// with the running dev server / HMR.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // We register the SW manually in main.jsx so we can skip it on native
      // (Capacitor) where a SW would intercept/block API calls.
      injectRegister: false,
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "favicon-32x32.png"],
      manifest: {
        name: "TerraVest — Wealth Management",
        short_name: "TerraVest",
        description: "All your personal and business wealth in one place.",
        theme_color: "#1A4D3B",
        background_color: "#1A4D3B",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        categories: ["finance", "productivity", "business"],
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // SPA: serve index.html for navigation requests.
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            // API gateway calls: prefer fresh data, fall back to cache offline.
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "tv-api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts / Tabler icon CDN assets.
            urlPattern: ({ url }) =>
              /fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.host),
            handler: "CacheFirst",
            options: {
              cacheName: "tv-cdn",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
  },
  // Vitest runs the unit tests only. The Playwright end-to-end suite under
  // tests/e2e/ uses Playwright's own test() runner (run via `npm run e2e`) and
  // must NOT be picked up here, or Vitest errors with
  // "Playwright Test did not expect test() to be called here".
  test: {
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
  },
});
