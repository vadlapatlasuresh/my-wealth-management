/* Client-side OCR for photo/scanned tax documents (W-2, 1099, …).

   tesseract.js is lazy-loaded only when an image is actually uploaded, so it never
   weighs down the main bundle. The recognized text is fed to the same backend parser
   as PDF text — so a photo of a W-2 extracts without any cloud OCR (AWS Textract).
   Never throws: on any failure the caller falls back to manual entry. */

let tesseractPromise = null;

function loadTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = import("tesseract.js");
  }
  return tesseractPromise;
}

/**
 * OCR an image File/Blob into text. `onProgress` (0..1) reports recognition progress so
 * the UI can show a spinner. Returns "" on failure rather than throwing.
 */
export async function recognizeImage(file, onProgress) {
  let worker = null;
  try {
    const { createWorker } = await loadTesseract();
    worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (m && m.status === "recognizing text" && typeof onProgress === "function") {
          onProgress(m.progress || 0);
        }
      },
    });
    const { data } = await worker.recognize(file);
    return (data && data.text) ? data.text : "";
  } catch {
    return "";
  } finally {
    try { if (worker) await worker.terminate(); } catch { /* ignore */ }
  }
}

/** True for files we can OCR client-side (images). */
export function isOcrableImage(file) {
  const type = (file && file.type) || "";
  const name = ((file && file.name) || "").toLowerCase();
  return type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/.test(name);
}
