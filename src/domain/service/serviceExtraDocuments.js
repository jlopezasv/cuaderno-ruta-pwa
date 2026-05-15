import { getUserId, sbFetch } from "../../data/supabaseClient.js";
import { uploadUserFile } from "../../data/uploadUserPhoto.js";
import {
  logExtraDoc,
  logExtraDocFail,
  parseSupabaseErrorBody,
} from "../documents/extraDocumentUploadLog.js";
import { isHttpStorageUrl } from "../documents/storageDocumentUploadLog.js";

const STORAGE_URL_ERROR = "Error generando URL del documento";

const TABLE = "servicio_documentos_extra";

export const EXTRA_DOC_TIPOS = Object.freeze([
  { id: "cmr", label: "CMR" },
  { id: "ticket", label: "Ticket" },
  { id: "factura", label: "Factura" },
  { id: "incidencia", label: "Incidencia" },
  { id: "foto", label: "Foto" },
  { id: "otro", label: "Otro" },
]);

/** URL usable en UI (archivo_url producción o url legacy). */
export function extraDocFileUrl(row) {
  if (!row) return null;
  const u = row.archivo_url ?? row.url ?? null;
  if (!u || typeof u !== "string") return null;
  return u;
}

export function isExtraDocUrlOpenable(url) {
  if (!url || typeof url !== "string") return false;
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:");
}

function normalizeExtraDocRow(row) {
  if (!row || typeof row !== "object") return row;
  const url = extraDocFileUrl(row);
  return {
    ...row,
    url,
    archivo_url: row.archivo_url ?? row.url ?? null,
    conductor_id: row.conductor_id ?? row.creado_por ?? null,
  };
}

function buildInsertPayloadModern({
  servicioId,
  servicio,
  tipo,
  descripcion,
  archivoUrl,
  archivoNombre,
  mimeType,
  sizeBytes,
  conductorId,
}) {
  return {
    servicio_id: servicioId,
    stop_id: null,
    empresa_id: servicio?.empresa_id ?? null,
    conductor_id: conductorId || null,
    tipo: String(tipo || "otro"),
    descripcion: descripcion?.trim() || null,
    archivo_url: archivoUrl || null,
    mime_type: mimeType || null,
    size_bytes: sizeBytes != null ? Number(sizeBytes) : null,
    archivo_nombre: archivoNombre || null,
    datos: {
      schema_version: 1,
      uploaded_at: new Date().toISOString(),
      storage_ok: !!(archivoUrl && String(archivoUrl).startsWith("http")),
    },
  };
}

/** Esquema migración repo 20260513120000 (url + creado_por). */
function buildInsertPayloadLegacy({ servicioId, tipo, descripcion, archivoUrl, archivoNombre, conductorId }) {
  return {
    servicio_id: servicioId,
    tipo: String(tipo || "otro"),
    descripcion: descripcion?.trim() || null,
    url: archivoUrl || null,
    archivo_nombre: archivoNombre || null,
    creado_por: conductorId || null,
  };
}

function assertArchivoUrlBeforeInsert(archivoUrl, label) {
  if (isHttpStorageUrl(archivoUrl)) return;
  logExtraDocFail("DOCUMENT_DB_INSERT_FAIL", new Error(STORAGE_URL_ERROR), {
    label,
    archivo_url: archivoUrl ?? null,
    blocked: true,
  });
  throw new Error(STORAGE_URL_ERROR);
}

async function postExtraDocRow(body, { label = "insert" } = {}) {
  const urlForInsert = body.archivo_url ?? body.url ?? null;
  assertArchivoUrlBeforeInsert(urlForInsert, label);
  logExtraDoc("DOCUMENT_DB_INSERT_START", { label, columns: Object.keys(body), payload: body });
  const r = await sbFetch(`/rest/v1/${TABLE}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const rawText = await r.text();
  let parsed = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }
  if (!r.ok) {
    const err = parseSupabaseErrorBody(rawText);
    logExtraDocFail("DOCUMENT_DB_INSERT_FAIL", err, { httpStatus: r.status, label, columns: Object.keys(body) });
    const e = new Error(err.message || `HTTP ${r.status}`);
    e.status = r.status;
    e.code = err.code;
    e.hint = err.hint;
    e.body = rawText;
    throw e;
  }
  const row = Array.isArray(parsed) ? parsed[0] : parsed;
  logExtraDoc("DOCUMENT_DB_INSERT_OK", {
    label,
    httpStatus: r.status,
    id: row?.id ?? null,
    servicio_id: row?.servicio_id ?? null,
    archivo_url: row?.archivo_url ?? row?.url ?? null,
  });
  return normalizeExtraDocRow(row);
}

async function insertServicioDocumentoExtraRow(args) {
  const modern = buildInsertPayloadModern(args);
  try {
    return await postExtraDocRow(modern, { label: "modern" });
  } catch (e) {
    const isSchema =
      e?.status === 400 &&
      (String(e?.code || "").includes("PGRST204") ||
        /column|schema cache|Could not find/i.test(String(e?.message || e?.body || "")));
    if (!isSchema) throw e;
    logExtraDoc("DOCUMENT_DB_INSERT_RETRY_LEGACY", { reason: e.message });
    const legacy = buildInsertPayloadLegacy(args);
    return await postExtraDocRow(legacy, { label: "legacy" });
  }
}

const EXTRA_DOCS_FETCH_CHUNK = 40;

/** Carga por servicio_id (RLS vía user_can_access_servicio). Método fiable para panel empresa. */
export async function fetchDocumentosExtraByServicioIds(servicioIds) {
  const ids = [...new Set((Array.isArray(servicioIds) ? servicioIds : []).filter(Boolean))];
  if (!ids.length) return [];
  const all = [];
  for (let i = 0; i < ids.length; i += EXTRA_DOCS_FETCH_CHUNK) {
    const slice = ids.slice(i, i + EXTRA_DOCS_FETCH_CHUNK);
    const r = await sbFetch(
      `/rest/v1/${TABLE}?servicio_id=in.(${slice.join(",")})&order=created_at.desc&select=*`,
    );
    const rawText = await r.text();
    if (!r.ok) {
      const err = parseSupabaseErrorBody(rawText);
      logExtraDocFail("DOCUMENT_REFRESH_FAIL", err, {
        httpStatus: r.status,
        scope: "empresa_by_servicio",
        chunkSize: slice.length,
      });
      continue;
    }
    try {
      const part = rawText ? JSON.parse(rawText) : [];
      if (Array.isArray(part)) all.push(...part);
    } catch {
      /* ignore parse */
    }
  }
  return all.map(normalizeExtraDocRow);
}

/**
 * Panel empresa: prioriza servicio_id (acceso RLS del jefe al viaje).
 * empresa_id en fila puede ser NULL aunque el servicio tenga empresa.
 */
export async function fetchEmpresaDocumentosExtra(empresaId, { servicioIds = null } = {}) {
  const ids = [...new Set((servicioIds || []).filter(Boolean))];
  const byId = new Map();

  try {
    if (ids.length) {
      const byServicio = await fetchDocumentosExtraByServicioIds(ids);
      for (const row of byServicio) {
        if (row?.id) byId.set(row.id, row);
      }
    }

    if (empresaId) {
      const r = await sbFetch(
        `/rest/v1/${TABLE}?empresa_id=eq.${empresaId}&order=created_at.desc&select=*`,
      );
      const rawText = await r.text();
      if (r.ok) {
        try {
          const rows = rawText ? JSON.parse(rawText) : [];
          for (const row of Array.isArray(rows) ? rows : []) {
            const n = normalizeExtraDocRow(row);
            if (n?.id) byId.set(n.id, n);
          }
        } catch {
          /* ignore */
        }
      } else {
        logExtraDocFail("DOCUMENT_REFRESH_FAIL", parseSupabaseErrorBody(rawText), {
          httpStatus: r.status,
          scope: "empresa_by_empresa_id",
          empresaId,
        });
      }
    }

    const list = [...byId.values()];
    logExtraDoc("DOCUMENT_REFRESH_OK", {
      scope: "empresa",
      empresaId,
      servicioIds: ids.length,
      count: list.length,
    });
    return list;
  } catch (e) {
    logExtraDocFail("DOCUMENT_REFRESH_FAIL", e, { empresaId, scope: "empresa" });
    throw e;
  }
}

export async function fetchServicioDocumentosExtra(servicioId) {
  if (!servicioId) return [];
  logExtraDoc("DOCUMENT_REFRESH_START", { servicioId });
  try {
    const r = await sbFetch(
      `/rest/v1/${TABLE}?servicio_id=eq.${servicioId}&order=created_at.desc&select=*`,
    );
    const rawText = await r.text();
    if (!r.ok) {
      const err = parseSupabaseErrorBody(rawText);
      logExtraDocFail("DOCUMENT_REFRESH_FAIL", err, { httpStatus: r.status, servicioId });
      throw new Error(err.message || `Listado HTTP ${r.status}`);
    }
    let rows = [];
    try {
      rows = rawText ? JSON.parse(rawText) : [];
    } catch {
      rows = [];
    }
    const list = (Array.isArray(rows) ? rows : []).map(normalizeExtraDocRow);
    logExtraDoc("DOCUMENT_REFRESH_OK", { servicioId, count: list.length, ids: list.map((x) => x.id) });
    return list;
  } catch (e) {
    logExtraDocFail("DOCUMENT_REFRESH_FAIL", e, { servicioId });
    throw e;
  }
}

/**
 * Flujo completo: storage → insert SQL → fila normalizada.
 * Lanza si cualquier paso falla (sin éxito falso).
 */
export async function uploadServicioDocumentoExtra({
  servicio,
  file,
  tipo,
  descripcion,
  folder = "servicio_extra",
}) {
  const servicioId = servicio?.id;
  const conductorId = getUserId();
  if (!servicioId) throw new Error("Servicio no válido");
  if (!file) throw new Error("Sin archivo");
  if (!conductorId) throw new Error("Sesión no válida — inicia sesión de nuevo");

  logExtraDoc("DOCUMENT_UPLOAD_START", {
    servicioId,
    tipo,
    fileName: file.name,
    fileSize: file.size,
    mime: file.type,
    empresa_id: servicio?.empresa_id ?? null,
    conductor_id: conductorId,
  });

  let archivoUrl;
  try {
    archivoUrl = await uploadUserFile(file, folder, { requireHttpUrl: true });
    if (isHttpStorageUrl(archivoUrl)) {
      logExtraDoc("DOCUMENT_STORAGE_OK", {
        urlPrefix: String(archivoUrl).slice(0, 80),
        signed: true,
      });
    } else {
      logExtraDoc("DOCUMENT_STORAGE_FAIL", {
        reason: "invalid_final_url",
        valueType: archivoUrl == null ? "null" : typeof archivoUrl,
        urlLength: archivoUrl != null && archivoUrl !== "" ? String(archivoUrl).length : 0,
        preview: archivoUrl != null ? String(archivoUrl).slice(0, 32) : null,
      });
      throw new Error(STORAGE_URL_ERROR);
    }
  } catch (e) {
    logExtraDocFail("DOCUMENT_STORAGE_FAIL", e, { servicioId });
    if (e?.message === STORAGE_URL_ERROR || !isHttpStorageUrl(archivoUrl)) {
      throw new Error(STORAGE_URL_ERROR);
    }
    throw e;
  }

  assertArchivoUrlBeforeInsert(archivoUrl, "pre_insert");

  const row = await insertServicioDocumentoExtraRow({
    servicioId,
    servicio,
    tipo,
    descripcion,
    archivoUrl,
    archivoNombre: file.name,
    mimeType: file.type || null,
    sizeBytes: file.size ?? null,
    conductorId,
  });

  if (!row?.id) {
    logExtraDocFail("DOCUMENT_DB_INSERT_FAIL", new Error("Sin id en respuesta"), { servicioId });
    throw new Error("El servidor no devolvió el documento creado");
  }

  return row;
}

/** @deprecated Usar uploadServicioDocumentoExtra */
export async function insertServicioDocumentoExtra({
  servicioId,
  servicio = null,
  tipo,
  descripcion,
  url,
  archivoNombre,
  mimeType = null,
  sizeBytes = null,
}) {
  return insertServicioDocumentoExtraRow({
    servicioId,
    servicio: servicio || { id: servicioId },
    tipo,
    descripcion,
    archivoUrl: url,
    archivoNombre,
    mimeType,
    sizeBytes,
    conductorId: getUserId(),
  });
}

export async function deleteServicioDocumentoExtra(id) {
  const r = await sbFetch(`/rest/v1/${TABLE}?id=eq.${id}`, { method: "DELETE" });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(parseSupabaseErrorBody(t).message || `DELETE HTTP ${r.status}`);
  }
}
