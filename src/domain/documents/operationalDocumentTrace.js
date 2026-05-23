/** Tracing temporal de pipeline documental operacional. Activar: localStorage.docTrace=1 o ?docTrace=1 */

import { getDocMeta, resolveEvidenciaDisplayImageUrl } from "./operationalDocumentRecord.js";

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

/** Descarga una URL y mide si el blob es escala de grises. */
export async function diagnoseImageUrl(url, label = "url") {
  if (!url || typeof url !== "string") {
    return { label, ok: false, reason: "sin_url" };
  }
  if (url.startsWith("data:")) {
    try {
      const r = await fetch(url);
      const blob = await r.blob();
      const color = await sampleBlobColorStats(blob, { label });
      return { label, url: "(data url)", fetchOk: true, color };
    } catch (e) {
      return { label, ok: false, reason: e?.message || String(e) };
    }
  }
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) {
      return { label, url: url.slice(0, 120), ok: false, httpStatus: res.status };
    }
    const blob = await res.blob();
    const color = await sampleBlobColorStats(blob, { label });
    return {
      label,
      url: url.split("?")[0].slice(-80),
      fetchOk: true,
      mime: blob.type,
      size: blob.size,
      color,
    };
  } catch (e) {
    return { label, url: url.slice(0, 120), ok: false, reason: e?.message || String(e) };
  }
}

/**
 * Diagnóstico completo de una evidencia guardada (parada o extra).
 * Uso: await __docTraceDiagnoseEvidencia(ev)  — ev = fila de evidencias o objeto del listado.
 */
export async function diagnoseEvidencia(ev) {
  const meta = getDocMeta(ev);
  const urls = {
    display: resolveEvidenciaDisplayImageUrl(ev),
    evidencias_url: ev?.url || null,
    preview_url: meta?.preview_url || ev?.previewUrl || null,
    original_url: meta?.original_url || ev?.originalUrl || null,
  };
  const unique = [];
  const seen = new Set();
  for (const [key, u] of Object.entries(urls)) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    unique.push([key, u]);
  }

  const checks = [];
  for (const [key, u] of unique) {
    checks.push(await diagnoseImageUrl(u, key));
  }

  const colorResults = checks.filter((c) => c.color?.ok);
  const allGray = colorResults.length > 0 && colorResults.every((c) => c.color.isLikelyGrayscale);
  const anyColor = colorResults.some((c) => !c.color.isLikelyGrayscale);

  let verdict;
  if (!colorResults.length) {
    verdict = "No se pudo leer ninguna URL (CORS, caducada o sin imagen). Abre la URL firmada en otra pestaña.";
  } else if (allGray) {
    verdict =
      "TODAS las URLs analizadas parecen B/N en bytes → el problema está en SUBIDA/STORAGE (o la cámara ya entregó la imagen sin color). Revisa [DOC_TRACE] foto_input vs foto_jpeg_blob.";
  } else if (anyColor && urls.original_url && urls.preview_url && urls.original_url !== urls.preview_url) {
    const prev = checks.find((c) => c.label === "preview_url" || c.label === "evidencias_url");
    const orig = checks.find((c) => c.label === "original_url");
    if (prev?.color?.isLikelyGrayscale && orig?.color && !orig.color.isLikelyGrayscale) {
      verdict =
        "Preview/columna url en B/N pero original en COLOR → el visor debe usar original_url (resolveEvidenciaDisplayImageUrl). Si ves B/N, la UI no está usando displayImageUrl.";
    } else {
      verdict = "Hay al menos una URL en color en Storage.";
    }
  } else {
    verdict = "Hay color en Storage; si la pantalla se ve B/N, el fallo es de VISUALIZACIÓN (CSS, caché local, img equivocada).";
  }

  const report = {
    evId: ev?.id,
    tipo: ev?.tipo,
    upload_pipeline: meta?.upload_pipeline ?? null,
    urls,
    checks,
    verdict,
  };

  console.log(PREFIX, "DIAGNOSE_EVIDENCIA", report);
  console.table(
    checks.map((c) => ({
      fuente: c.label,
      gris: c.color?.isLikelyGrayscale ?? "?",
      maxSpread: c.color?.maxChannelSpread ?? "—",
      avgRGB: c.color?.ok ? `${c.color.avgR},${c.color.avgG},${c.color.avgB}` : "—",
      size: c.size ?? c.color?.size ?? "—",
    })),
  );
  return report;
}

/** Resumen del último upload de foto en el buffer de trace. */
export function diagnoseLastFotoUploadFromTrace() {
  const rows = dumpOperationalDocTrace();
  const relevant = rows.filter(
    (r) =>
      String(r.step || "").includes("foto") ||
      String(r.step || "").includes("uploadOperationalDocument") ||
      String(r.step || "").includes("persistEvidencia"),
  );
  const last = relevant.slice(-12);
  const branch = [...rows].reverse().find((r) => String(r.step || "").includes("branch_foto"));
  const inputGray = [...rows]
    .reverse()
    .find((r) => r.colorSample?.label?.includes("foto_input") || r.step?.includes("foto_input"));
  const jpegGray = [...rows]
    .reverse()
    .find((r) => r.colorSample?.label?.includes("foto_jpeg") || r.step?.includes("foto_jpeg"));

  const report = {
    lastSteps: last.map((r) => ({ t: r.t, step: r.step, pipeline: r.upload_pipeline || r.pipeline })),
    lastBranch: branch
      ? {
          step: branch.step,
          pipeline: branch.pipeline,
          sameAsExtraDocs: branch.sameAsExtraDocs,
        }
      : null,
    inputFromCamera: inputGray?.colorSample ?? null,
    afterJpegEncode: jpegGray?.colorSample ?? null,
    hint:
      "Si input isLikelyGrayscale=true → la cámara/archivo ya viene sin color. Si solo jpeg es gris → fallo en compressImage/canvas.",
  };
  console.log(PREFIX, "LAST_FOTO_UPLOAD", report);
  return report;
}

if (typeof window !== "undefined") {
  window.__docTraceEnable = enableOperationalDocTrace;
  window.__docTraceDump = () => {
    const rows = dumpOperationalDocTrace();
    console.table(rows);
    return rows;
  };
  window.__docTraceDiagnoseUrl = diagnoseImageUrl;
  window.__docTraceDiagnoseEvidencia = diagnoseEvidencia;
  window.__docTraceLastFoto = diagnoseLastFotoUploadFromTrace;
  if (isOperationalDocTraceEnabled()) {
    logOperationalBundleAudit();
    traceOperationalDoc("trace_enabled", {
      hint: "localStorage.docTrace=1 | ?docTrace=1 | __docTraceEnable() | __docTraceDiagnoseEvidencia(ev)",
    });
  }
}
