import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// TerraVest OPS PORTAL build — a separate bundle for a separate origin (ops.terravest.app).
//
// A second config rather than a second entry in the member build, on purpose:
//
//  - TOTAL ASSET SEPARATION. Output goes to dist-ops/, which Caddy serves only on the ops
//    host. "Agent tooling is never shipped to members" is then literally true — not a
//    tree-shaking claim that a stray import could quietly break.
//  - NO PWA. The member build's vite-plugin-pwa precaches everything it finds in the output
//    dir; sharing an output would push the ops console into every member's service-worker
//    cache. And an ops console that works offline is one whose staff cannot tell whether
//    they are looking at live data — on a tool that issues refunds, that is a way to make a
//    real mistake.
//
// Same VITE_API_BASE as the member build: both talk to the same gateway. The ops origin must
// be present in GATEWAY_CORS_ALLOWED_ORIGINS or every call fails CORS.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-ops",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "ops.html")
    }
  }
});
