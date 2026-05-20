/** Procesado ligero de fotos documentales: recorte, contraste, compresión (~500 KB). */

import {
  decodeImageFileForCanvas,
  releaseDecodedImage,
} from "./imageBlobLoad.js";
import {
  isOperationalDocTraceEnabled,
  sampleCanvasColorStats,
  traceBlobColor,
  traceOperationalDoc,
} from "./operationalDocumentTrace.js";

/** Límites unificados para subidas operativas (CMR, fotos, extras, tacógrafo). */
export const OPERATIONAL_UPLOAD_MAX_BYTES = 500 * 1024;
export const OPERATIONAL_UPLOAD_MAX_EDGE = 1600;
export const OPERATIONAL_UPLOAD_JPEG_QUALITY = 0.7;

const DEFAULT_MAX_BYTES = OPERATIONAL_UPLOAD_MAX_BYTES;
const MAX_EDGE = OPERATIONAL_UPLOAD_MAX_EDGE;

function drawDecodedToCanvas(decoded, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(decoded.draw, 0, 0, w, h);
  return { canvas, ctx };
}

/** Detección simple de bordes del documento (fondo claro). */
function findDocumentBounds(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  const step = Math.max(2, Math.floor(Math.min(w, h) / 200));
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 235) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) return { x: 0, y: 0, w, h };

  const padX = Math.round(w * 0.02);
  const padY = Math.round(h * 0.02);
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(w - 1, maxX + padX);
  maxY = Math.min(h - 1, maxY + padY);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  if (cw < w * 0.25 || ch < h * 0.25) return { x: 0, y: 0, w, h };
  return { x: minX, y: minY, w: cw, h: ch };
}

function scaleToMaxEdge(w, h, maxEdge) {
  if (w <= maxEdge && h <= maxEdge) return { w, h };
  if (w >= h) {
    return { w: maxEdge, h: Math.round((h * maxEdge) / w) };
  }
  return { w: Math.round((w * maxEdge) / h), h: maxEdge };
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

async function compressCanvasToTarget(canvas, maxBytes, initialQuality = OPERATIONAL_UPLOAD_JPEG_QUALITY) {
  let quality = initialQuality;
  let blob = await canvasToBlob(canvas, quality);
  while (blob && blob.size > maxBytes && quality > 0.45) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, quality);
  }
  return blob;
}

/**
 * Compresión previa al upload (EXIF/iOS, ~500 KB, borde máx. 1600 px).
 * @returns {Promise<{ blob: Blob, width: number, height: number, bytes: number, processed: boolean }>}
 */
export async function compressOperationalImageFile(
  file,
  {
    maxBytes = DEFAULT_MAX_BYTES,
    maxEdge = MAX_EDGE,
    initialQuality = OPERATIONAL_UPLOAD_JPEG_QUALITY,
  } = {},
) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    return {
      blob: file,
      width: 0,
      height: 0,
      bytes: file?.size || 0,
      processed: false,
    };
  }

  const decoded = await decodeImageFileForCanvas(file);
  try {
    let w = decoded.width;
    let h = decoded.height;
    const scaled = scaleToMaxEdge(w, h, maxEdge);
    w = scaled.w;
    h = scaled.h;
    const { canvas } = drawDecodedToCanvas(decoded, w, h);
    const blob = await compressCanvasToTarget(canvas, maxBytes, initialQuality);
    return {
      blob: blob || file,
      width: w,
      height: h,
      bytes: blob?.size || file.size,
      processed: true,
    };
  } finally {
    releaseDecodedImage(decoded);
  }
}

/**
 * @returns {Promise<{ previewBlob: Blob, originalBlob: Blob|null, width: number, height: number, previewBytes: number, originalBytes: number, processed: boolean }>}
 */
/**
 * @param {boolean} [documentMode] — recorte automático (CMR/escaneos). Fotos operativas: false.
 */
export async function processOperationalDocumentImage(
  file,
  { maxBytes = DEFAULT_MAX_BYTES, documentMode = false, forUpload = false } = {},
) {
  const traceOn = isOperationalDocTraceEnabled();
  if (traceOn) {
    traceOperationalDoc("processOperationalDocumentImage:enter", {
      fn: "processOperationalDocumentImage",
      documentMode,
      forUpload,
      maxBytes,
      fileName: file?.name ?? null,
      fileMime: file?.type ?? null,
      fileSize: file?.size ?? null,
      enhanceDocumentContrast: false,
      ocrBranch: false,
    });
    if (file) await traceBlobColor("processOperationalDocumentImage:input_file", file, { documentMode });
  }

  if (!file || !String(file.type || "").startsWith("image/")) {
    if (traceOn) {
      traceOperationalDoc("processOperationalDocumentImage:skip_non_image", {
        passthrough: true,
        documentMode,
      });
    }
    return {
      previewBlob: file,
      originalBlob: null,
      width: 0,
      height: 0,
      previewBytes: file?.size || 0,
      originalBytes: file?.size || 0,
      processed: false,
    };
  }

  const decoded = await decodeImageFileForCanvas(file);
  try {
  let w = decoded.width;
  let h = decoded.height;
  const scaled = scaleToMaxEdge(w, h, MAX_EDGE);
  w = scaled.w;
  h = scaled.h;

  let { canvas, ctx } = drawDecodedToCanvas(decoded, w, h);

  if (documentMode) {
    if (traceOn) {
      traceOperationalDoc("processOperationalDocumentImage:document_crop_branch", {
        documentMode: true,
        enhanceDocumentContrast: false,
        getImageDataForBounds: true,
        putImageDataCrop: true,
      });
    }
    const bounds = findDocumentBounds(ctx, w, h);
    if (bounds.w < w || bounds.h < h) {
      const cropped = ctx.getImageData(bounds.x, bounds.y, bounds.w, bounds.h);
      const c2 = document.createElement("canvas");
      c2.width = bounds.w;
      c2.height = bounds.h;
      c2.getContext("2d").putImageData(cropped, 0, 0);
      canvas = c2;
      ctx = canvas.getContext("2d");
      w = bounds.w;
      h = bounds.h;
    }
  } else if (traceOn) {
    traceOperationalDoc("processOperationalDocumentImage:foto_branch", {
      documentMode: false,
      skippedCrop: true,
      enhanceDocumentContrast: false,
    });
  }

  if (traceOn) {
    traceOperationalDoc("processOperationalDocumentImage:after_draw", {
      canvasColor: sampleCanvasColorStats(canvas, { label: "post_draw_pre_jpeg" }),
    });
  }

  const previewBlob = await compressCanvasToTarget(canvas, maxBytes);
  const keepOriginal = forUpload
    ? false
    : !documentMode && file.size > 100 * 1024
      ? true
      : file.size > (previewBlob?.size || 0) * 1.25;

  const result = {
    previewBlob: previewBlob || file,
    originalBlob: keepOriginal ? file : null,
    width: w,
    height: h,
    previewBytes: previewBlob?.size || file.size,
    originalBytes: file.size,
    processed: true,
  };

  if (traceOn) {
    await traceBlobColor("processOperationalDocumentImage:preview_blob", result.previewBlob, {
      documentMode,
      keepOriginal,
    });
    if (result.originalBlob) {
      await traceBlobColor("processOperationalDocumentImage:original_blob", result.originalBlob, {
        documentMode,
      });
    }
    traceOperationalDoc("processOperationalDocumentImage:exit", {
      fn: "processOperationalDocumentImage",
      documentMode,
      forUpload,
      previewBytes: result.previewBytes,
      originalBytes: result.originalBytes,
      width: result.width,
      height: result.height,
      hasOriginalBlob: !!result.originalBlob,
    });
  }

  return result;
  } finally {
    releaseDecodedImage(decoded);
  }
}

/**
 * Alias legacy — si aparece en logs, hay import/ruta antigua activa.
 * @deprecated usar processOperationalDocumentImage
 */
export async function processDocumentImage(file, options = {}) {
  traceOperationalDoc("processDocumentImage:LEGACY_ALIAS_CALLED", {
    fn: "processDocumentImage",
    documentMode: options.documentMode ?? false,
    enhanceDocumentContrast: false,
    redirectedTo: "processOperationalDocumentImage",
  });
  return processOperationalDocumentImage(file, options);
}

export function formatStorageBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
