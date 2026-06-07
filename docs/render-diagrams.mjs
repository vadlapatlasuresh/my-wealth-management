#!/usr/bin/env node
/**
 * render-diagrams.mjs — scan every Markdown file in the repo, extract its ```mermaid
 * blocks, and emit a single self-contained docs/diagrams.html that RENDERS them all
 * (grouped by file, with the nearest heading as a caption + a clickable index).
 *
 * No build tooling, no extensions: run it and open the HTML in any browser.
 *
 *   node docs/render-diagrams.mjs
 *   open docs/diagrams.html            # macOS  (or just double-click it)
 *
 * Mermaid itself is loaded from a CDN, so the page needs internet the first time.
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git", "dist", "target", "build", "ios", "android", ".idea", ".vscode"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Pull mermaid blocks + the nearest preceding heading from one markdown file. */
function extract(md) {
  const lines = md.split("\n");
  const blocks = [];
  let heading = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^#{1,6}\s+(.*)/);
    if (h) heading = h[1].trim();
    if (line.trim().startsWith("```mermaid")) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      blocks.push({ heading, code: buf.join("\n") });
    }
  }
  return blocks;
}

const files = walk(ROOT).sort();
let total = 0;
const sections = [];
const toc = [];

for (const file of files) {
  const blocks = extract(readFileSync(file, "utf8"));
  if (!blocks.length) continue;
  const rel = relative(ROOT, file);
  const id = rel.replace(/[^a-zA-Z0-9]/g, "_");
  toc.push(`<li><a href="#${id}">${esc(rel)}</a> <span class="count">${blocks.length}</span></li>`);
  const diagrams = blocks
    .map(
      (b, n) => `
      <figure>
        <figcaption>${esc(b.heading || "diagram " + (n + 1))}</figcaption>
        <pre class="mermaid">${esc(b.code)}</pre>
      </figure>`
    )
    .join("\n");
  sections.push(`<section id="${id}"><h2>${esc(rel)}</h2>${diagrams}</section>`);
  total += blocks.length;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>My Wealth Management — Diagram Gallery (${total} diagrams)</title>
<style>
  :root { --green:#1A4D3B; --gold:#C9973A; --bg:#f7f7f4; --card:#fff; --border:#e4e4df; --muted:#6b6b66; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, "DM Sans", Segoe UI, Roboto, sans-serif; background:var(--bg); color:#1a1a1a; }
  header { background:var(--green); color:#fff; padding:18px 24px; position:sticky; top:0; z-index:10; }
  header h1 { margin:0; font-size:18px; } header p { margin:4px 0 0; opacity:.8; font-size:13px; }
  .layout { display:grid; grid-template-columns: 300px 1fr; gap:0; align-items:start; }
  nav { position:sticky; top:74px; height:calc(100vh - 74px); overflow:auto; padding:16px; border-right:1px solid var(--border); background:var(--card); }
  nav ul { list-style:none; margin:0; padding:0; } nav li { margin:2px 0; font-size:13px; }
  nav a { color:var(--green); text-decoration:none; } nav a:hover { text-decoration:underline; }
  .count { color:var(--muted); font-size:11px; }
  main { padding:24px; max-width:1100px; }
  section { margin-bottom:40px; }
  section h2 { font-size:15px; color:var(--green); border-bottom:2px solid var(--gold); padding-bottom:6px; }
  figure { margin:0 0 22px; background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px; }
  figcaption { font-weight:600; margin-bottom:10px; color:#333; }
  .mermaid { overflow:auto; }
  .filterbox { width:100%; padding:8px 10px; margin-bottom:10px; border:1px solid var(--border); border-radius:8px; font-size:13px; }
</style>
</head>
<body>
<header>
  <h1>My Wealth Management — Diagram Gallery</h1>
  <p>${total} flowcharts &amp; sequence diagrams across ${sections.length} files · regenerate with <code>node docs/render-diagrams.mjs</code></p>
</header>
<div class="layout">
  <nav>
    <input class="filterbox" placeholder="Filter files…" oninput="for(const li of document.querySelectorAll('nav li')){li.style.display=li.textContent.toLowerCase().includes(this.value.toLowerCase())?'':'none'}" />
    <ul>${toc.join("\n")}</ul>
  </nav>
  <main>${sections.join("\n")}</main>
</div>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
</script>
</body>
</html>`;

const outPath = join(ROOT, "docs", "diagrams.html");
writeFileSync(outPath, html);
console.log(`Wrote ${relative(ROOT, outPath)} — ${total} diagrams from ${sections.length} files.`);
