import { getUserId, sbFetch } from "../../data/supabaseClient.js";
import { uploadUserFile } from "../../data/uploadUserPhoto.js";
import { storageUploadUrl } from "../documents/mediaStorageV2.js";
import { isHttpStorageUrl } from "../documents/storageDocumentUploadLog.js";
import { parseSupabaseErrorBody } from "../documents/extraDocumentUploadLog.js";

const TABLE = "servicio_documentos_empresa";
const STORAGE_FOLDER = "documentos_empresa";
const STORAGE_URL_ERROR = "Error generando URL del documento";

export const EMPRESA_DOC_ALLOWED_MIME = Object.freeze([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

export const EMPRESA_DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

export function isEmpresaDocMimeAllowed(file) {
  if (!file) return false;
  const mime = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  if (EMPRESA_DOC_ALLOWED_MIME.includes(mime)) return true;
  return /\.(pdf|jpe?g|png)$/.test(name);
}

export function empresaDocFileUrl(row) {
  if (!row) return null;
  const u = row.archivo_url ?? null;
  return typeof u === "string" && u.length > 0 ? u : null;
}

export function isEmpresaDocUrlOpenable(url) {
  if (!url || typeof url !== "string") return false;
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:");
}

function normalizeEmpresaDocRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    archivo_url: row.archivo_url ?? null,
    subido_por_nombre: row.subido_por_nombre || null,
  };
}

function assertArchivoUrl(archivoUrl) {
  if (isHttpStorageUrl(archivoUrl)) return;
  throw new Error(STORAGE_URL_ERROR);
}

export async function fetchServicioDocumentosEmpresa(servicioId) {
  if (!servicioId) return [];
  const r = await sbFetch(
    `/rest/v1/${TABLE}?servicio_id=eq.${servicioId}&order=created_at.desc&select=*`,
  );
  const rawText = await r.text();
  if (!r.ok) {
    const err = parseSupabaseErrorBody(rawText);
    throw new Error(err.message || `Listado HTTP ${r.status}`);
  }
  let rows = [];
  try {
    rows = rawText ? JSON.parse(rawText) : [];
  } catch {
    rows = [];
  }
  return (Array.isArray(rows) ? rows : []).map(normalizeEmpresaDocRow);
}

export async function uploadServicioDocumentoEmpresa({
  servicio,
  file,
  subidoPorNombre = null,
}) {
  const servicioId = servicio?.id;
  const empresaId = servicio?.empresa_id;
  const subidoPor = getUserId();
  if (!servicioId) throw new Error("Servicio no válido");
  if (!empresaId) throw new Error("Este servicio no pertenece a una empresa");
  if (!file) throw new Error("Sin archivo");
  if (!subidoPor) throw new Error("Sesión no válida — inicia sesión de nuevo");
  if (!isEmpresaDocMimeAllowed(file)) {
    throw new Error("Formato no permitido. Usa PDF, JPG, JPEG o PNG.");
  }

  const folder = `${STORAGE_FOLDER}/${empresaId}/${servicioId}`;
  const storageResult = await uploadUserFile(file, folder, { requireHttpUrl: true });
  const archivoUrl = storageUploadUrl(storageResult);
  assertArchivoUrl(archivoUrl);

  const body = {
    servicio_id: servicioId,
    empresa_id: empresaId,
    subido_por: subidoPor,
    subido_por_nombre: subidoPorNombre ? String(subidoPorNombre).trim() : null,
    archivo_url: archivoUrl,
    archivo_nombre: file.name || "documento",
    mime_type: file.type || null,
    size_bytes: file.size != null ? Number(file.size) : null,
  };

  const r = await sbFetch(`/rest/v1/${TABLE}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const rawText = await r.text();
  if (!r.ok) {
    const err = parseSupabaseErrorBody(rawText);
    throw new Error(err.message || `HTTP ${r.status}`);
  }
  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }
  const row = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!row?.id) throw new Error("El servidor no devolvió el documento creado");
  return normalizeEmpresaDocRow(row);
}

export async function deleteServicioDocumentoEmpresa(id) {
  if (!id) return;
  const r = await sbFetch(`/rest/v1/${TABLE}?id=eq.${id}`, { method: "DELETE" });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(parseSupabaseErrorBody(t).message || `DELETE HTTP ${r.status}`);
  }
}

export function triggerEmpresaDocDownload(row) {
  const url = empresaDocFileUrl(row);
  if (!isEmpresaDocUrlOpenable(url)) return false;
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.download = row?.archivo_nombre || "documento-empresa";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
