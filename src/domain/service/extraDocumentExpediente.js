import { formatStorageBytes } from "../documents/operationalDocumentPipeline.js";
import { EXTRA_DOC_TIPOS, extraDocFileUrl } from "./serviceExtraDocuments.js";

function parseTs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function fmtClock(ms) {
  if (ms == null) return "—";
  return new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function urlDedupKey(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return String(url).split("?")[0];
  }
}

function bucketForExtraTipo(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (t === "cmr") return "cmr";
  if (t === "foto") return "fotos";
  if (t === "incidencia") return "incidencias";
  return "documentos";
}

function tipoLabel(tipo) {
  return EXTRA_DOC_TIPOS.find((x) => x.id === tipo)?.label || String(tipo || "Documento");
}

/** Fila servicio_documentos_extra → evidencia unificada para expediente empresa. */
export function extraDocToExpedienteEvidence(row, { nombreConductor, servicio } = {}) {
  const url = extraDocFileUrl(row);
  const docMeta = row?.datos?.doc_meta && typeof row.datos.doc_meta === "object" ? row.datos.doc_meta : null;
  const tipo = String(row?.tipo || "otro").toLowerCase();
  const mime = row?.mime_type || docMeta?.mime_type || "";
  const archivoNombre = row?.archivo_nombre || null;
  const tipoLbl = tipoLabel(tipo);
  const title = archivoNombre || tipoLbl;
  const ms = parseTs(row?.created_at);
  const conductorName =
    typeof nombreConductor === "function"
      ? nombreConductor(row?.conductor_id || servicio?.conductor_id)
      : null;
  const sizeBytes = row?.size_bytes != null ? Number(row.size_bytes) : null;
  const sizeLabel = sizeBytes != null && sizeBytes > 0 ? formatStorageBytes(sizeBytes) : null;
  const isPdf = mime.includes("pdf") || String(archivoNombre || "").toLowerCase().endsWith(".pdf");

  return {
    id: `extra:${row.id}`,
    tipo,
    titulo: `${tipoLbl} · ${title}`,
    detalle: row?.descripcion?.trim() || "",
    created_at: row?.created_at,
    hora: fmtClock(ms),
    url: docMeta?.preview_url || url,
    previewUrl: docMeta?.preview_url || url,
    originalUrl: docMeta?.original_url || null,
    nota: row?.descripcion || null,
    datos: {
      ...(row?.datos && typeof row.datos === "object" ? row.datos : {}),
      source: "servicio_documentos_extra",
      mime_type: mime || null,
      archivo_nombre: archivoNombre,
    },
    bucket: bucketForExtraTipo(tipo),
    displayTitle: tipoLbl,
    displaySubtitle: row?.descripcion?.trim() || archivoNombre || title,
    displayLine2: [conductorName, sizeLabel, isPdf ? "PDF" : "Archivo"].filter(Boolean).join(" · "),
    displaySizeLabel: sizeLabel,
    displayKindLabel: isPdf ? "PDF" : mime.startsWith("image/") ? "Foto" : "Archivo",
    stopId: null,
    stopLabel: "Documento extra",
    stopName: servicio?.cliente || servicio?.referencia || "Servicio",
    source: "servicio_documentos_extra",
    extraDocId: row.id,
    conductor_id: row?.conductor_id ?? null,
    mime_type: mime || null,
    size_bytes: sizeBytes,
    archivo_nombre: archivoNombre,
  };
}

export function groupExtraDocsByServicioId(rows) {
  const map = {};
  for (const row of rows || []) {
    const sid = row?.servicio_id;
    if (!sid) continue;
    if (!map[sid]) map[sid] = [];
    map[sid].push(row);
  }
  for (const sid of Object.keys(map)) {
    map[sid].sort((a, b) => parseTs(b?.created_at) - parseTs(a?.created_at));
  }
  return map;
}

/**
 * Añade documentos extra sin duplicar URLs ya presentes en evidencias de parada.
 * No modifica timeline (sin ruido operacional).
 */
export function mergeExtraDocsIntoExpedienteEvidencias(evidencias, extraRows, ctx = {}) {
  const base = Array.isArray(evidencias) ? [...evidencias] : [];
  const seen = new Set();
  for (const ev of base) {
    const key = urlDedupKey(ev?.url || ev?.previewUrl);
    if (key) seen.add(key);
    if (ev?.id) seen.add(`id:${ev.id}`);
  }

  const added = [];
  for (const row of extraRows || []) {
    const normalized = extraDocToExpedienteEvidence(row, ctx);
    const urlKey = urlDedupKey(normalized.url);
    if (urlKey && seen.has(urlKey)) continue;
    if (normalized.extraDocId && seen.has(`extra:${normalized.extraDocId}`)) continue;
    if (urlKey) seen.add(urlKey);
    if (normalized.extraDocId) seen.add(`extra:${normalized.extraDocId}`);
    if (!normalized.url) continue;
    added.push(normalized);
  }

  added.sort((a, b) => parseTs(a.created_at) - parseTs(b.created_at));
  return [...base, ...added];
}
