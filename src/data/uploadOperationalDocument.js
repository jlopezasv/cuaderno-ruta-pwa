import { processOperationalDocumentImage } from "../domain/documents/operationalDocumentPipeline.js";
import {
  buildOperationalDocumentName,
  buildOperationalFileName,
} from "../domain/documents/operationalDocumentNaming.js";
import { buildDocMetaPayload } from "../domain/documents/operationalDocumentRecord.js";
import {
  isOperationalDocTraceEnabled,
  traceBlobColor,
  traceOperationalDoc,
} from "../domain/documents/operationalDocumentTrace.js";
import { uploadBlobToStorage, uploadUserFile } from "./uploadUserPhoto.js";

function extFromImageMime(mime, originalName) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("heic") || m.includes("heif")) return "heic";
  if (originalName && /\.png$/i.test(originalName)) return "png";
  return "jpg";
}

/**
 * Sube preview operacional (+ original opcional) con metadatos.
 * @returns {Promise<{ previewUrl: string, originalUrl: string|null, docMeta: object, displayName: string }>}
 */
export async function uploadOperationalDocument(file, {
  folder = "stops",
  tipo = "foto",
  context = {},
  processImage = true,
} = {}) {
  const traceOn = isOperationalDocTraceEnabled();
  const isFotoTipo = String(tipo || "").toLowerCase() === "foto";
  const isPdfEarly =
    String(file?.type || "").includes("pdf") || String(file?.name || "").toLowerCase().endsWith(".pdf");
  if (traceOn) {
    traceOperationalDoc("uploadOperationalDocument:enter", {
      fn: "uploadOperationalDocument",
      tipo,
      folder,
      processImage,
      documentModeWillBe: processImage ? !isFotoTipo : null,
      isPdf: isPdfEarly,
      fileName: file?.name ?? null,
      fileMime: file?.type ?? null,
      fileSize: file?.size ?? null,
      enhanceDocumentContrast: false,
      legacyUploadUserFileBranch: !processImage && !isPdfEarly,
    });
    if (file && String(file.type || "").startsWith("image/")) {
      await traceBlobColor("uploadOperationalDocument:input", file, { tipo, processImage });
    }
  }

  const {
    servicio = null,
    stop = null,
    conductorName = null,
    conductorId = null,
    cliente = null,
    ciudad = null,
    eventoOperacional = null,
    geo = null,
  } = context;

  const displayName = buildOperationalDocumentName({
    tipo,
    fecha: new Date().toISOString(),
    cliente: cliente || servicio?.cliente,
    ciudad: ciudad || stop?.nombre,
    conductor: conductorName,
    servicioRef: servicio?.referencia,
    stop,
  });

  const isPdf =
    String(file?.type || "").includes("pdf") || String(file?.name || "").toLowerCase().endsWith(".pdf");

  let previewUrl;
  let originalUrl = null;
  let width = null;
  let height = null;
  let previewBytes = file?.size || 0;
  let originalBytes = null;
  let mime = file?.type || "image/jpeg";

  if (isPdf) {
    if (traceOn) traceOperationalDoc("uploadOperationalDocument:branch_pdf", { tipo });
    previewUrl = await uploadUserFile(file, folder);
    mime = "application/pdf";
  } else if (processImage && isFotoTipo) {
    // Fotos: sin canvas (drawImage→JPEG pierde color en HEIC/Display P3 en móvil).
    const ext = extFromImageMime(file.type, file.name);
    mime = file.type || (ext === "png" ? "image/png" : "image/jpeg");
    const fileName = buildOperationalFileName(displayName, ext);
    if (traceOn) {
      traceOperationalDoc("uploadOperationalDocument:branch_foto_raw", {
        tipo,
        processImage: true,
        canvasPipeline: false,
        reason: "preserve_camera_color",
      });
      await traceBlobColor("uploadOperationalDocument:foto_raw_file", file, { tipo });
    }
    previewUrl = await uploadBlobToStorage(file, mime, folder, fileName);
    originalUrl = previewUrl;
    previewBytes = file.size || 0;
    originalBytes = file.size || 0;
    if (traceOn) {
      traceOperationalDoc("uploadOperationalDocument:after_storage", {
        preview_url: previewUrl,
        original_url: originalUrl,
        previewBytes,
        originalBytes,
        sameBlob: true,
      });
    }
  } else if (processImage) {
    const documentMode = true;
    if (traceOn) {
      traceOperationalDoc("uploadOperationalDocument:branch_processImage", {
        tipo,
        isFoto: false,
        documentMode,
        processImage: true,
        calls: "processOperationalDocumentImage",
      });
    }
    const processed = await processOperationalDocumentImage(file, {
      documentMode,
    });
    const previewName = buildOperationalFileName(displayName, "jpg");
    if (traceOn) {
      await traceBlobColor("uploadOperationalDocument:preview_blob_before_storage", processed.previewBlob, {
        blobRole: "preview",
        documentMode,
      });
    }
    previewUrl = await uploadBlobToStorage(processed.previewBlob, "image/jpeg", folder, previewName);
    previewBytes = processed.previewBytes;
    width = processed.width;
    height = processed.height;
    if (processed.originalBlob) {
      const origName = buildOperationalFileName(`${displayName}_original`, "jpg");
      if (traceOn) {
        await traceBlobColor("uploadOperationalDocument:original_blob_before_storage", processed.originalBlob, {
          blobRole: "original",
        });
      }
      originalUrl = await uploadBlobToStorage(processed.originalBlob, file.type || "image/jpeg", `${folder}/original`, origName);
      originalBytes = processed.originalBytes;
    }
    if (traceOn) {
      traceOperationalDoc("uploadOperationalDocument:after_storage", {
        preview_url: previewUrl,
        original_url: originalUrl,
        previewBytes,
        originalBytes,
      });
    }
  } else {
    if (traceOn) {
      traceOperationalDoc("uploadOperationalDocument:branch_legacy_uploadUserFile", {
        tipo,
        processImage: false,
        warning: "Ruta compressImage(uploadUserPhoto) — no operational pipeline",
      });
    }
    previewUrl = await uploadUserFile(file, folder);
  }

  const docMeta = buildDocMetaPayload({
    displayName,
    archivoNombre: buildOperationalFileName(displayName, isPdf ? "pdf" : "jpg"),
    mimeType: mime,
    sizeBytes: previewBytes + (originalBytes || 0),
    sizePreviewBytes: previewBytes,
    sizeOriginalBytes: originalBytes,
    width,
    height,
    previewUrl,
    originalUrl,
    stopId: stop?.id || null,
    servicioId: servicio?.id || null,
    conductorId: conductorId || servicio?.conductor_id || null,
    tipoDocumento: tipo,
    cliente: cliente || null,
    ciudad: ciudad || stop?.nombre || null,
    eventoOperacional,
    geo,
  });

  if (traceOn) {
    traceOperationalDoc("uploadOperationalDocument:exit", {
      fn: "uploadOperationalDocument",
      tipo,
      processImage,
      preview_url: docMeta.preview_url,
      original_url: docMeta.original_url,
      mime: docMeta.mime_type,
      sizePreviewBytes: docMeta.size_preview_bytes,
      sizeOriginalBytes: docMeta.size_original_bytes,
    });
  }

  return { previewUrl, originalUrl, docMeta, displayName };
}
