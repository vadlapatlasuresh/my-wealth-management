/* Client-side PDF → text extraction for the W-2/1099 uploader.
   pdf.js is lazy-loaded (only when a PDF is actually chosen) so it never weighs
   down the main bundle. Text items are regrouped into reading order (rows by Y,
   left-to-right by X) so a downstream regex sees label/value pairs the way a
   human reads them — important for the two-column W-2 layout. */

let pdfjsPromise = null;

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      // Vite resolves this to a hashed URL for the worker bundle.
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/** Extract all text from a PDF File/Blob, reconstructed into rough reading order. */
export async function extractPdfText(file) {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  let out = "";

  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items = content.items
        .filter((i) => i && typeof i.str === "string" && i.str.trim() !== "")
        .map((i) => ({ s: i.str, x: i.transform[4], y: Math.round(i.transform[5]) }))
        .sort((a, b) => (b.y - a.y) || (a.x - b.x)); // top-to-bottom, then left-to-right

      let lastY = null;
      let line = "";
      for (const it of items) {
        if (lastY !== null && Math.abs(it.y - lastY) > 3) {
          out += line.trim() + "\n";
          line = "";
        }
        line += it.s + " ";
        lastY = it.y;
      }
      out += line.trim() + "\n";
    }
  } finally {
    // Release the worker's document so the next uploaded PDF starts clean.
    try { await pdf.destroy(); } catch { /* ignore */ }
  }
  return out.trim();
}
