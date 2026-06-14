import { getUserId, sbFetch } from "../../data/supabaseClient.js";
import { uploadBlobToStorage } from "../../data/uploadUserPhoto.js";
import { storageUploadUrl } from "../documents/mediaStorageV2.js";
import { isHttpStorageUrl } from "../documents/storageDocumentUploadLog.js";
import { parseSupabaseErrorBody } from "../documents/extraDocumentUploadLog.js";
import { isDemoApp } from "../../config/appEnvironment.js";
import { buildDcdtPdfBlob } from "./dcdtPdfBuilder.js";
import { markDcdtPdfGenerado } from "./dcdtModel.js";

const TABLE = "servicio_documentos_extra";
export const DCDT_RETENTION_DAYS = 365;

function retentionUntilIso(from = new Date()) {
  return new Date(from.getTime() + DCDT_RETENTION_DAYS * 86400000).toISOString();
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

/**
 * Genera PDF DCDT, lo sube a storage y lo registra como documento del servicio (tipo dcdt).
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

  const blob = await buildDcdtPdfBlob(doc);
  const serviceLabel = String(doc.referencia || servicio.id).replace(/[^\w.\-áéíóúñ]+/gi, "_");
  const filename = `dcdt-${serviceLabel}.pdf`;
  const folder = `dcdt/${servicio.empresa_id || "empresa"}/${servicio.id}`;
  const storage = await uploadBlobToStorage(blob, "application/pdf", folder, filename, {
    requireHttpUrl: true,
  });
  const archivoUrl = storageUploadUrl(storage);
  const generatedAt = new Date().toISOString();
  const retentionUntil = retentionUntilIso(new Date(generatedAt));
  const dcdtVersion = dcdt.updatedAt || generatedAt;

  const datosPayload = {
    schema_version: 1,
    tipo_documento: "dcdt",
    dcdt_id: dcdt.id,
    estado: "generado",
    generado_por: uid,
    generado_por_nombre: userLabel ? String(userLabel).trim() : null,
    generado_en: generatedAt,
    retention_until: retentionUntil,
    min_retention_days: DCDT_RETENTION_DAYS,
    dcdt_version: dcdtVersion,
    uploaded_at: generatedAt,
    storage_ok: true,
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

  const existingId = dcdt.datos?.pdf_documento_extra_id || null;
  let extraDoc;
  if (existingId) {
    extraDoc = await patchExtraDocRow(existingId, rowBody);
  } else {
    extraDoc = await postExtraDocRow(rowBody);
  }

  const nextDcdt = await markDcdtPdfGenerado(dcdt.id, {
    pdfDocumentoExtraId: extraDoc.id,
    pdfArchivoUrl: archivoUrl,
    pdfArchivoNombre: filename,
    pdfRetentionUntil: retentionUntil,
    pdfDcdtVersion: dcdtVersion,
  });

  if (isDemoApp()) {
    console.log("[DCDT PDF] guardado", {
      servicio_id: servicio.id,
      dcdt_id: dcdt.id,
      extra_doc_id: extraDoc.id,
      retention_until: retentionUntil,
    });
  }

  if (downloadAfter && typeof document !== "undefined") {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { dcdt: nextDcdt, extraDoc, blob, archivoUrl, filename };
}

export function openDcdtStoredPdf(dcdt) {
  const url = String(dcdt?.datos?.pdf_archivo_url || "").trim();
  if (!url) return false;
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}
