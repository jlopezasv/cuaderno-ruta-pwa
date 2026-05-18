import { formatStorageBytes } from "./operationalDocumentPipeline.js";
import { operationalGroupFromStopTipo } from "../service/tripOperationalDossier.js";

export const DOC_META_SCHEMA = 1;

/** Hooks reservados (QR muelle, check-in, firma…) — sin implementar. */
export const DOC_FUTURE_HOOKS = Object.freeze({
  qr_muelle: null,
  check_in_carga: null,
  validacion_llegada: null,
  firma: null,
  escaneo_expedicion: null,
});

export function getDocMeta(ev) {
  const d = ev?.datos;
  if (!d || typeof d !== "object") return null;
  return d.doc_meta && typeof d.doc_meta === "object" ? d.doc_meta : null;
}

export function mergeDocMetaIntoDatos(datos, docMeta) {
  const base = datos && typeof datos === "object" && !Array.isArray(datos) ? { ...datos } : {};
  return { ...base, doc_meta: { schema_version: DOC_META_SCHEMA, ...docMeta, future_hooks: { ...DOC_FUTURE_HOOKS, ...(docMeta?.future_hooks || {}) } } };
}

export function buildDocMetaPayload({
  displayName,
  mimeType,
  sizeBytes,
  sizePreviewBytes = null,
  sizeOriginalBytes = null,
  width = null,
  height = null,
  previewUrl = null,
  originalUrl = null,
  stopId = null,
  servicioId = null,
  conductorId = null,
  tipoDocumento = null,
  cliente = null,
  ciudad = null,
  eventoOperacional = null,
  archivoNombre = null,
  geo = null,
}) {
  return {
    schema_version: DOC_META_SCHEMA,
    display_name: displayName,
    archivo_nombre: archivoNombre || displayName,
    mime_type: mimeType || "image/jpeg",
    size_bytes: sizeBytes ?? sizePreviewBytes ?? 0,
    size_preview_bytes: sizePreviewBytes ?? sizeBytes ?? 0,
    size_original_bytes: sizeOriginalBytes ?? null,
    width,
    height,
    preview_url: previewUrl,
    original_url: originalUrl,
    stop_id: stopId,
    servicio_id: servicioId,
    conductor_id: conductorId,
    tipo_documento: tipoDocumento,
    cliente,
    ciudad,
    evento_operacional: eventoOperacional,
    geo: geo && Number.isFinite(Number(geo.lat)) ? geo : null,
    future_hooks: { ...DOC_FUTURE_HOOKS },
    created_at: new Date().toISOString(),
  };
}

function stopKindLabel(stop) {
  const g = operationalGroupFromStopTipo(stop?.tipo);
  if (g === "carga") return "carga";
  if (g === "descarga") return "descarga";
  if (g === "carga_descarga") return "carga/descarga";
  return String(stop?.tipo || "parada").replace(/_/g, " ");
}

function tipoHeadline(tipo, meta, ev) {
  if (meta?.evento_operacional) return meta.evento_operacional;
  if (tipo === "cmr") {
    const dock = meta?.ciudad ? ` · ${meta.ciudad}` : "";
    return `CMR ${stopKindLabel({ tipo: meta?.stop_tipo })}${dock}`.replace("CMR carga", "CMR carga").trim();
  }
  if (tipo === "foto") return `Foto ${stopKindLabel({ tipo: meta?.stop_tipo })}`;
  if (tipo === "incidencia") return `Incidencia · ${meta?.ciudad || "operativa"}`;
  if (ev?.datos?.num_cmr) return `CMR ${ev.datos.num_cmr}`;
  return (tipo || "documento").toUpperCase();
}

/** URL para mostrar la imagen en color (original si existe; si no, preview). */
export function resolveEvidenciaDisplayImageUrl(ev) {
  const meta = getDocMeta(ev);
  return meta?.original_url || ev?.originalUrl || meta?.preview_url || ev?.previewUrl || ev?.url || null;
}

export function enrichEvidenciaDisplay(ev, { stop = null, conductorName = null } = {}) {
  const meta = getDocMeta(ev);
  const tipo = ev?.tipo || meta?.tipo_documento || "documento";
  const created = ev?.created_at || meta?.created_at;
  const dateLabel = created
    ? new Date(created).toLocaleDateString("es-ES", { day: "numeric", month: "short" }).toUpperCase()
    : "—";
  const sizeBytes = meta?.size_preview_bytes ?? meta?.size_bytes ?? null;
  const mime = meta?.mime_type || (ev?.url?.includes(".pdf") ? "application/pdf" : "image/jpeg");

  const title = meta?.display_name
    ? meta.display_name.replace(/_/g, " · ").replace(/\s+/g, " ").trim()
    : tipoHeadline(tipo, { ...meta, stop_tipo: stop?.tipo, ciudad: meta?.ciudad || stop?.nombre }, ev);

  const subtitleParts = [
    dateLabel,
    conductorName || null,
    stop?.nombre || meta?.ciudad || null,
  ].filter(Boolean);

  const sizeLabel = sizeBytes != null ? formatStorageBytes(sizeBytes) : null;
  const kindLabel = mime?.includes("pdf") ? "PDF" : mime?.startsWith("image/") ? "Foto" : "Archivo";

  return {
    ...ev,
    displayTitle: title,
    displaySubtitle: subtitleParts.join(" · "),
    displaySizeLabel: sizeLabel,
    displayKindLabel: kindLabel,
    displayLine2: [kindLabel, sizeLabel].filter(Boolean).join(" · "),
    previewUrl: meta?.preview_url || ev?.url || null,
    originalUrl: meta?.original_url || null,
    displayImageUrl: resolveEvidenciaDisplayImageUrl(ev),
    lazyThumb: true,
    docMeta: meta,
  };
}

export function sumExpedienteBytes(evidenciasList) {
  let total = 0;
  for (const ev of evidenciasList || []) {
    const m = getDocMeta(ev);
    if (m?.size_bytes) total += Number(m.size_bytes) || 0;
    else if (m?.size_preview_bytes) total += Number(m.size_preview_bytes) || 0;
    else if (ev?.size_bytes) total += Number(ev.size_bytes) || 0;
  }
  return total;
}

export function expedienteSizeLabel(evidenciasList) {
  return formatStorageBytes(sumExpedienteBytes(evidenciasList));
}
