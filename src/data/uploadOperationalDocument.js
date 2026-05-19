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
import { storageUploadUrl, traceMediaV2DocMeta, traceRawPhotoMode } from "../domain/documents/mediaStorageV2.js";
import { uploadBlobToStorage, uploadUserFile } from "./uploadUserPhoto.js";

function extensionFromFile(file) {
  const name = String(file?.name || "").toLowerCase();
  const mime = String(file?.type || "").toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("heic") || mime.includes("heif")) return "heic";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  const match = name.match(/\.([a-z0-9]{2,5})$/);
  return match ? match[1] : "jpg";
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

  if (isFotoTipo) {
    traceRawPhotoMode("upload_enter", {
      fileName: file?.name ?? null,
      mime: file?.type || null,
      sizeBytes: file?.size ?? null,
      canvasPipeline: false,
    });
  }

  if (traceOn) {
    traceOperationalDoc("uploadOperationalDocument:enter", {
      fn: "uploadOperationalDocument",
      tipo,
      folder,
      processImage: isFotoTipo ? false : processImage,
      rawPhotoMode: isFotoTipo,
      canvasPipeline: isFotoTipo ? false : processImage && !isPdfEarly,
      isPdf: isPdfEarly,
      fileName: file?.name ?? null,
      fileMime: file?.type ?? null,
      fileSize: file?.size ?? null,
    });
    if (file && String(file.type || "").startsWith("image/") && !isFotoTipo) {
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
  let storagePreview = null;
  let storageOriginal = null;
  let width = null;
  let height = null;
  let previewBytes = file?.size || 0;
  let originalBytes = null;
  let mime = file?.type || "image/jpeg";
  let uploadPipeline = "legacy_upload_user_file";

  if (isPdf) {
    if (traceOn) traceOperationalDoc("uploadOperationalDocument:branch_pdf", { tipo });
    storagePreview = await uploadUserFile(file, folder);
    previewUrl = storageUploadUrl(storagePreview);
    mime = "application/pdf";
    uploadPipeline = "pdf_raw";
  } else if (isFotoTipo) {
    mime = file?.type || `image/${extensionFromFile(file)}`;
    const fileExt = extensionFromFile(file);
    const storageName = file?.name || buildOperationalFileName(displayName, fileExt);

    traceRawPhotoMode("upload_start", {
      mime,
      sizeBytes: file?.size ?? 0,
      canvasPipeline: false,
      storageName,
      folder,
    });

    storagePreview = await uploadBlobToStorage(file, mime, folder, storageName, {
      requireHttpUrl: true,
      allowBase64Fallback: false,
    });
    previewUrl = storageUploadUrl(storagePreview);
    previewBytes = file?.size ?? 0;
    originalUrl = previewUrl;
    uploadPipeline = "foto_raw_v1";

    traceRawPhotoMode("upload_done", {
      mime,
      sizeBytes: previewBytes,
      canvasPipeline: false,
      preview_url: previewUrl,
      bucket: storagePreview?.bucket ?? null,
      path_preview: storagePreview?.path ?? null,
    });
  } else if (processImage) {
    const documentMode = true;
    if (traceOn) {
      traceOperationalDoc("uploadOperationalDocument:branch_processImage", {
        tipo,
        documentMode,
        processImage: true,
        canvasPipeline: true,
        calls: "processOperationalDocumentImage",
      });
    }
    mime = "image/jpeg";
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
    storagePreview = await uploadBlobToStorage(processed.previewBlob, "image/jpeg", folder, previewName);
    previewUrl = storageUploadUrl(storagePreview);
    previewBytes = processed.previewBytes;
    width = processed.width;
    height = processed.height;
    uploadPipeline = "document_canvas";
    if (processed.originalBlob) {
      const origName = buildOperationalFileName(`${displayName}_original`, "jpg");
      if (traceOn) {
        await traceBlobColor("uploadOperationalDocument:original_blob_before_storage", processed.originalBlob, {
          blobRole: "original",
        });
      }
      storageOriginal = await uploadBlobToStorage(
        processed.originalBlob,
        file.type || "image/jpeg",
        `${folder}/original`,
        origName,
      );
      originalUrl = storageUploadUrl(storageOriginal);
      originalBytes = processed.originalBytes;
    }
    if (traceOn) {
      traceOperationalDoc("uploadOperationalDocument:after_storage", {
        preview_url: previewUrl,
        original_url: originalUrl,
        previewBytes,
        originalBytes,
        canvasPipeline: true,
      });
    }
  } else {
    if (traceOn) {
      traceOperationalDoc("uploadOperationalDocument:branch_legacy_uploadUserFile", {
        tipo,
        processImage: false,
      });
    }
    storagePreview = await uploadUserFile(file, folder);
    previewUrl = storageUploadUrl(storagePreview);
    uploadPipeline = "legacy_upload_user_file";
  }

  const fileExtForMeta = isPdf ? "pdf" : isFotoTipo ? extensionFromFile(file) : "jpg";

  const docMeta = buildDocMetaPayload({
    displayName,
    archivoNombre: buildOperationalFileName(displayName, fileExtForMeta),
    mimeType: mime,
    sizeBytes: previewBytes + (originalBytes || 0),
    sizePreviewBytes: previewBytes,
    sizeOriginalBytes: originalBytes,
    width,
    height,
    previewUrl,
    originalUrl: isFotoTipo ? previewUrl : originalUrl,
    storagePreview,
    storageOriginal: isFotoTipo ? null : storageOriginal,
    stopId: stop?.id || null,
    servicioId: servicio?.id || null,
    conductorId: conductorId || servicio?.conductor_id || null,
    tipoDocumento: tipo,
    cliente: cliente || null,
    ciudad: ciudad || stop?.nombre || null,
    eventoOperacional,
    geo,
    uploadPipeline,
  });

  traceMediaV2DocMeta(docMeta, { fn: "uploadOperationalDocument", tipo });
  if (isFotoTipo) {
    traceRawPhotoMode("doc_meta_built", {
      mime: docMeta.mime_type,
      sizeBytes: docMeta.size_preview_bytes,
      canvasPipeline: false,
      upload_pipeline: docMeta.upload_pipeline,
      path_preview: docMeta.path_preview,
    });
  }

  if (traceOn) {
    traceOperationalDoc("uploadOperationalDocument:exit", {
      fn: "uploadOperationalDocument",
      tipo,
      rawPhotoMode: isFotoTipo,
      canvasPipeline: isFotoTipo ? false : processImage && !isPdf,
      preview_url: docMeta.preview_url,
      original_url: docMeta.original_url,
      bucket: docMeta.bucket,
      path_preview: docMeta.path_preview,
      signed_expires_at: docMeta.signed_expires_at,
      mime: docMeta.mime_type,
      sizePreviewBytes: docMeta.size_preview_bytes,
    });
  }

  return { previewUrl, originalUrl: isFotoTipo ? previewUrl : originalUrl, docMeta, displayName };
}
