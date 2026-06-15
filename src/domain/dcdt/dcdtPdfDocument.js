import { getUserId, sbFetch } from "../../data/supabaseClient.js";
import {
  uploadBlobToStorage,
  uploadBlobAtStoragePath,
  signStorageObjectPath,
  USER_PHOTOS_BUCKET,
} from "../../data/uploadUserPhoto.js";
import { storageUploadUrl } from "../documents/mediaStorageV2.js";
import { isHttpStorageUrl } from "../documents/storageDocumentUploadLog.js";
import { parseSupabaseErrorBody } from "../documents/extraDocumentUploadLog.js";
import { isDemoApp } from "../../config/appEnvironment.js";
import { buildDcdtPdfBlob } from "./dcdtPdfBuilder.js";
import { ensureDecaPublicId, markDcdtPdfGenerado } from "./dcdtModel.js";
import { buildDecaDownloadUrl } from "./decaUrl.js";
import { generateDecaQrPngBytes } from "./decaQrImage.js";

const TABLE = "servicio_documentos_extra";
export const DCDT_RETENTION_DAYS = 365;

function retentionUntilIso(from = new Date()) {
  return new Date(from.getTime() + DCDT_RETENTION_DAYS * 86400000).toISOString();
}

function dcdtPdfDemoLog(phase, extra) {
  if (!isDemoApp()) return;
  if (extra !== undefined) console.log(`[DCDT PDF] ${phase}`, extra);
  else console.log(`[DCDT PDF] ${phase}`);
}

function resolveDecaQrStoragePath({ uid, empresaId, servicioId, pdfStoragePath, existingQrPath }) {
  if (existingQrPath) return existingQrPath;
  if (pdfStoragePath) {
    const dir = String(pdfStoragePath).replace(/\/[^/]+\.pdf$/i, "");
    if (dir) return `${dir}/deca-qr.png`;
  }
  return `${uid}/dcdt/${empresaId || "empresa"}/${servicioId}/deca-qr.png`;
}

async function postExtraDocRow(body) {
  const urlForInsert = body.archivo_url ?? body.url ?? null;
  if (!isHttpStorageUrl(urlForInsert)) throw new Error("Error generando URL del PDF DCDT");
  const r = await sbFetch(`/rest/v1/${TABLE}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const rawText = await r.text();
  if (!r.ok) {
    const err = parseSupabaseErrorBody(rawText);
    throw new Error(err.message || `No se pudo guardar PDF DCDT (${r.status})`);
  }
  const parsed = rawText ? JSON.parse(rawText) : null;
  const row = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!row?.id) throw new Error("El servidor no devolvió el documento DCDT");
  return row;
}

async function patchExtraDocRow(id, body) {
  const r = await sbFetch(`/rest/v1/${TABLE}?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const rawText = await r.text();
  if (!r.ok) {
    const err = parseSupabaseErrorBody(rawText);
    throw new Error(err.message || `No se pudo actualizar PDF DCDT (${r.status})`);
  }
  const parsed = rawText ? JSON.parse(rawText) : null;
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

/** URL accesible (renueva firma si hay bucket/path). */
export async function resolveDcdtPdfAccessUrl(dcdt) {
  const bucket = dcdt?.datos?.pdf_storage_bucket || USER_PHOTOS_BUCKET;
  const path = dcdt?.datos?.pdf_storage_path;
  if (path) {
    const signed = await signStorageObjectPath(bucket, path);
    return storageUploadUrl(signed);
  }
  const legacy = String(dcdt?.datos?.pdf_archivo_url || "").trim();
  return isHttpStorageUrl(legacy) ? legacy : null;
}

/** URL firmada del PNG QR DeCA (fichero suelto). */
export async function resolveDecaQrPngAccessUrl(dcdt) {
  const bucket = dcdt?.datos?.deca_qr_png_storage_bucket || USER_PHOTOS_BUCKET;
  const path = dcdt?.datos?.deca_qr_png_storage_path;
  if (!path) return null;
  const signed = await signStorageObjectPath(bucket, path);
  return storageUploadUrl(signed);
}

function triggerBlobDownload(blob, filename) {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Descarga PDF guardado (renueva URL firmada). */
export async function downloadDcdtStoredPdf(dcdt, filename = "dcdt.pdf") {
  const accessUrl = await resolveDcdtPdfAccessUrl(dcdt);
  if (!accessUrl) throw new Error("PDF DCDT no disponible en storage");
  const res = await fetch(accessUrl);
  if (!res.ok) throw new Error(`No se pudo descargar el PDF (${res.status})`);
  const blob = await res.blob();
  if (!blob?.size) throw new Error("PDF DCDT vacío o corrupto");
  triggerBlobDownload(blob, filename);
  return { url: accessUrl, blob };
}

/** Descarga PNG del QR DeCA (fichero suelto). */
export async function downloadDecaQrPng(dcdt, filename = "deca-qr.png") {
  const accessUrl = await resolveDecaQrPngAccessUrl(dcdt);
  if (!accessUrl) throw new Error("QR DeCA no disponible en storage");
  const res = await fetch(accessUrl);
  if (!res.ok) throw new Error(`No se pudo descargar el QR (${res.status})`);
  const blob = await res.blob();
  if (!blob?.size) throw new Error("QR DeCA vacío o corrupto");
  const name =
    filename ||
    `DeCA-QR-${String(dcdt?.datos?.pdf_archivo_nombre || "qr").replace(/\.pdf$/i, ".png")}`;
  triggerBlobDownload(blob, name);
  return { url: accessUrl, blob };
}

/**
 * Genera PDF DCDT con QR embebido, lo sube a storage y lo registra como documento del servicio (tipo dcdt).
 */
export async function generateAndPersistDcdtPdf({
  servicio,
  dcdt,
  doc,
  userId = null,
  userLabel = null,
  downloadAfter = false,
}) {
  if (!servicio?.id || !dcdt?.id || !doc) throw new Error("Datos DCDT incompletos");
  const uid = userId || getUserId();
  if (!uid) throw new Error("Sesión no válida");

  const dcdtReady = await ensureDecaPublicId(dcdt);
  const decaPublicId = dcdtReady.decaPublicId;
  const decaDownloadUrl = buildDecaDownloadUrl(decaPublicId, {
    allowBrowserOriginFallback: typeof window !== "undefined",
  });

  dcdtPdfDemoLog("deca_download_url", decaDownloadUrl);

  const qrPngBytes = await generateDecaQrPngBytes(decaDownloadUrl);
  const qrPngBlob = new Blob([qrPngBytes], { type: "image/png" });

  dcdtPdfDemoLog("generando");
  const blob = await buildDcdtPdfBlob(doc, {
    creationDate: dcdtReady.createdAt || null,
    qrPngBytes,
  });
  if (!blob?.size) throw new Error("No se pudo generar el PDF DCDT");

  const serviceLabel = String(doc.referencia || servicio.id).replace(/[^\w.\-áéíóúñ]+/gi, "_");
  const filename = `dcdt-${serviceLabel}.pdf`;

  // Descarga inmediata (antes del upload) para no perder el gesto del usuario en el navegador.
  if (downloadAfter) triggerBlobDownload(blob, filename);
  const folder = `dcdt/${servicio.empresa_id || "empresa"}/${servicio.id}`;

  // Siempre nueva ruta con timestamp: cada «Generar PDF» sustituye el binario servido por /api/dcdt-download.
  const storage = await uploadBlobToStorage(blob, "application/pdf", folder, filename, {
    requireHttpUrl: true,
  });

  const storagePath = storage?.path;
  const storageBucket = storage?.bucket || USER_PHOTOS_BUCKET;
  if (!storagePath) throw new Error("PDF DCDT: upload sin ruta en storage");

  const qrStoragePath = resolveDecaQrStoragePath({
    uid,
    empresaId: servicio.empresa_id,
    servicioId: servicio.id,
    pdfStoragePath: storagePath,
    existingQrPath: dcdtReady.datos?.deca_qr_png_storage_path,
  });
  const qrStorage = await uploadBlobAtStoragePath(qrPngBlob, "image/png", storageBucket, qrStoragePath, {
    requireHttpUrl: true,
  });

  const archivoUrl = storageUploadUrl(storage);
  if (!isHttpStorageUrl(archivoUrl)) throw new Error("PDF DCDT: URL de storage inválida");

  dcdtPdfDemoLog("storage_path", storagePath);
  dcdtPdfDemoLog("qr_storage_path", qrStoragePath);
  dcdtPdfDemoLog("public_url", archivoUrl);

  const generatedAt = new Date().toISOString();
  const retentionUntil = retentionUntilIso(new Date(generatedAt));
  const dcdtVersion = dcdtReady.updatedAt || generatedAt;

  const datosPayload = {
    schema_version: 1,
    tipo_documento: "dcdt",
    dcdt_id: dcdtReady.id,
    estado: "generado",
    generado_por: uid,
    generado_por_nombre: userLabel ? String(userLabel).trim() : null,
    generado_en: generatedAt,
    retention_until: retentionUntil,
    min_retention_days: DCDT_RETENTION_DAYS,
    dcdt_version: dcdtVersion,
    uploaded_at: generatedAt,
    storage_ok: true,
    bucket: storageBucket,
    path: storagePath,
    deca_public_id: decaPublicId,
    deca_download_url: decaDownloadUrl,
    deca_qr_png_bucket: qrStorage.bucket,
    deca_qr_png_path: qrStorage.path,
    pdf_size_bytes: blob.size,
    pdf_has_qr: true,
  };

  const rowBody = {
    servicio_id: servicio.id,
    empresa_id: servicio.empresa_id ?? null,
    conductor_id: null,
    tipo: "dcdt",
    descripcion: "Documento de Control del Transporte (DCDT)",
    archivo_url: archivoUrl,
    url: archivoUrl,
    mime_type: "application/pdf",
    size_bytes: blob.size,
    archivo_nombre: filename,
    datos: datosPayload,
  };

  const existingId = dcdtReady.datos?.pdf_documento_extra_id || null;
  let extraDoc;
  if (existingId) {
    extraDoc = await patchExtraDocRow(existingId, rowBody);
  } else {
    extraDoc = await postExtraDocRow(rowBody);
  }

  dcdtPdfDemoLog("documento_id", extraDoc.id);

  const nextDcdt = await markDcdtPdfGenerado(dcdtReady.id, {
    pdfDocumentoExtraId: extraDoc.id,
    pdfArchivoUrl: archivoUrl,
    pdfArchivoNombre: filename,
    pdfRetentionUntil: retentionUntil,
    pdfDcdtVersion: dcdtVersion,
    pdfStorageBucket: storageBucket,
    pdfStoragePath: storagePath,
    decaDownloadUrl,
    decaQrPngStorageBucket: qrStorage.bucket,
    decaQrPngStoragePath: qrStorage.path,
    pdfSizeBytes: blob.size,
    pdfHasQr: true,
  });

  dcdtPdfDemoLog("generado", {
    servicio_id: servicio.id,
    dcdt_id: dcdtReady.id,
    deca_public_id: decaPublicId,
    documento_id: extraDoc.id,
    storage_path: storagePath,
    qr_storage_path: qrStoragePath,
    deca_download_url: decaDownloadUrl,
  });

  return {
    dcdt: nextDcdt,
    extraDoc,
    blob,
    archivoUrl,
    filename,
    storagePath,
    decaDownloadUrl,
    qrPngBlob,
    qrStoragePath,
    pdfSizeBytes: blob.size,
    generatedAt,
  };
}

/** Abre PDF en nueva pestaña (renueva URL firmada). */
export async function openDcdtStoredPdf(dcdt) {
  const url = await resolveDcdtPdfAccessUrl(dcdt);
  if (!url || typeof window === "undefined") return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
