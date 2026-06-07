// Regenerate all PWA / app icons from the single source SVG.
// Usage:  npm run icons
// Source: src/assets/app-icon.svg  ->  public/*.png
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = "src/assets/app-icon.svg";
const OUT = "public";
const svg = readFileSync(SRC);

const targets = [
  ["pwa-192x192.png", 192, false],
  ["pwa-512x512.png", 512, false],
  ["maskable-512x512.png", 512, true],
  ["apple-touch-icon.png", 180, false],
  ["favicon-32x32.png", 32, false],
];

for (const [name, size, maskable] of targets) {
  let img = sharp(svg).resize(size, size);
  if (maskable) {
    // Maskable icons need a safe zone — pad content to ~78% on a forest bg.
    const inner = Math.round(size * 0.78);
    const buf = await sharp(svg).resize(inner, inner).png().toBuffer();
    img = sharp({
      create: { width: size, height: size, channels: 4, background: "#1A4D3B" },
    }).composite([{ input: buf, gravity: "center" }]);
  }
  await img.png().toFile(join(OUT, name));
  console.log("wrote", name);
}
