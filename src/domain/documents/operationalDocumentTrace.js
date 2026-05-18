/** Tracing temporal de pipeline documental operacional. Activar: localStorage.docTrace=1 o ?docTrace=1 */

const PREFIX = "[DOC_TRACE]";
const BUFFER_KEY = "docTraceBuffer";
const MAX_BUFFER = 250;

function shortStack(depth = 4) {
  try {
    return String(new Error().stack || "")
      .split("\n")
      .slice(2, 2 + depth)
      .map((l) => l.trim());
  } catch {
    return [];
  }
}

export function isOperationalDocTraceEnabled() {
  if (typeof window === "undefined") return false;
  try {
    if (window.__DOC_TRACE__ === true) return true;
    if (localStorage.getItem("docTrace") === "1") return true;
    return /(?:\?|&)docTrace=1(?:&|$)/.test(window.location.search || "");
  } catch {
    return false;
  }
}

export function enableOperationalDocTrace() {
  try {
    localStorage.setItem("docTrace", "1");
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") window.__DOC_TRACE__ = true;
  logOperationalBundleAudit();
}

export function traceOperationalDoc(step, payload = {}) {
  if (!isOperationalDocTraceEnabled()) return;
  const entry = {
    t: new Date().toISOString(),
    step,
    stack: shortStack(5),
    ...payload,
  };
  console.log(PREFIX, step, entry);
  try {
    const buf = JSON.parse(localStorage.getItem(BUFFER_KEY) || "[]");
    buf.push(entry);
    while (buf.length > MAX_BUFFER) buf.shift();
    localStorage.setItem(BUFFER_KEY, JSON.stringify(buf));
  } catch {
    /* ignore */
  }
}

export function dumpOperationalDocTrace() {
  try {
    return JSON.parse(localStorage.getItem(BUFFER_KEY) || "[]");
  } catch {
    return [];
  }
}

/** Muestreo de color en blob (¿escala de grises?). */
export async function sampleBlobColorStats(blob, { label = "blob", maxEdge = 120 } = {}) {
  if (!blob || !(blob instanceof Blob)) {
    return { label, ok: false, reason: "no_blob" };
  }
  const mime = blob.type || "application/octet-stream";
  if (!mime.startsWith("image/")) {
    return { label, ok: false, mime, size: blob.size, reason: "not_image" };
  }
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height, 1));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const { data } = ctx.getImageData(0, 0, w, h);
    let n = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let grayPixels = 0;
    let maxChannelSpread = 0;
    const step = Math.max(1, Math.floor((w * h) / 800));
    for (let i = 0; i < data.length; i += 4 * step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      sumR += r;
      sumG += g;
      sumB += b;
      n += 1;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (spread > maxChannelSpread) maxChannelSpread = spread;
      if (spread <= 2) grayPixels += 1;
    }
    const avgR = n ? sumR / n : 0;
    const avgG = n ? sumG / n : 0;
    const avgB = n ? sumB / n : 0;
    const grayRatio = n ? grayPixels / n : 0;
    const isLikelyGrayscale = grayRatio > 0.92 && maxChannelSpread <= 8;
    return {
      label,
      ok: true,
      mime,
      size: blob.size,
      samples: n,
      avgR: Math.round(avgR),
      avgG: Math.round(avgG),
      avgB: Math.round(avgB),
      maxChannelSpread,
      grayPixelRatio: Number(grayRatio.toFixed(3)),
      isLikelyGrayscale,
    };
  } catch (e) {
    return { label, ok: false, mime, size: blob?.size, reason: e?.message || String(e) };
  }
}

export async function traceBlobColor(step, blob, extra = {}) {
  const stats = await sampleBlobColorStats(blob, { label: step });
  traceOperationalDoc(step, { ...extra, colorSample: stats });
  return stats;
}

/** Tras drawImage / getImageData en canvas — ¿píxeles ya desaturados? */
export function sampleCanvasColorStats(canvas, { label = "canvas" } = {}) {
  try {
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return { label, ok: false, reason: "empty_canvas" };
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const { data } = ctx.getImageData(0, 0, w, h);
    let n = 0;
    let grayPixels = 0;
    let maxSpread = 0;
    const step = Math.max(1, Math.floor((w * h) / 600));
    for (let i = 0; i < data.length; i += 4 * step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (spread > maxSpread) maxSpread = spread;
      if (spread <= 2) grayPixels += 1;
      n += 1;
    }
    const grayRatio = n ? grayPixels / n : 0;
    return {
      label,
      ok: true,
      w,
      h,
      samples: n,
      maxChannelSpread: maxSpread,
      grayPixelRatio: Number(grayRatio.toFixed(3)),
      isLikelyGrayscale: grayRatio > 0.92 && maxSpread <= 8,
      usedGetImageData: true,
    };
  } catch (e) {
    return { label, ok: false, reason: e?.message || String(e) };
  }
}

let bundleAuditDone = false;

/** Una vez por sesión: símbolos legacy ausentes / presentes en bundle. */
export function logOperationalBundleAudit() {
  if (bundleAuditDone && !isOperationalDocTraceEnabled()) return;
  bundleAuditDone = true;
  const enhanceDocumentContrast =
    typeof globalThis !== "undefined" && typeof globalThis.enhanceDocumentContrast === "function";
  traceOperationalDoc("bundle_audit", {
    enhanceDocumentContrastInGlobal: enhanceDocumentContrast,
    enhanceDocumentContrastInRepo: false,
    processDocumentImageExport: false,
    note: "processDocumentImage y enhanceDocumentContrast no existen en src/ — si aparecen en stack, bundle cacheado o import externo",
    location: typeof window !== "undefined" ? window.location.href : null,
    buildHint: import.meta?.env?.MODE ?? null,
  });
}

if (typeof window !== "undefined") {
  window.__docTraceEnable = enableOperationalDocTrace;
  window.__docTraceDump = () => {
    const rows = dumpOperationalDocTrace();
    console.table(rows);
    return rows;
  };
  if (isOperationalDocTraceEnabled()) {
    logOperationalBundleAudit();
    traceOperationalDoc("trace_enabled", {
      hint: "localStorage.docTrace=1 | ?docTrace=1 | __docTraceEnable()",
    });
  }
}
