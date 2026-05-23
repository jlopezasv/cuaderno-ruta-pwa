import { formatStorageBytes } from "./operationalDocumentPipeline.js";
import { docMetaV2StorageFields, storageUploadUrl, traceMediaV2DocMeta } from "./mediaStorageV2.js";
import { isOperationalDocTraceEnabled, traceOperationalDoc } from "./operationalDocumentTrace.js";
import { operationalGroupFromStopTipo } from "../service/tripOperationalDossier.js";

/** Lectura legacy (filas antiguas). Escritura nueva: {@link DOC_META_SCHEMA_V2}. */
export const DOC_META_SCHEMA = 1;
export const DOC_META_SCHEMA_V2 = 2;

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
  const version = docMeta?.schema_version ?? DOC_META_SCHEMA_V2;
  const merged = { schema_version: version, ...docMeta, future_hooks: { ...DOC_FUTURE_HOOKS, ...(docMeta?.future_hooks || {}) } };
  traceMediaV2DocMeta(merged, { fn: "mergeDocMetaIntoDatos" });
  return { ...base, doc_meta: merged };
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
  uploadPipeline = null,
  storagePreview = null,
  storageOriginal = null,
}) {
  const resolvedPreviewUrl = previewUrl ?? storageUploadUrl(storagePreview);
  const resolvedOriginalUrl = originalUrl ?? storageUploadUrl(storageOriginal);
  const v2 = docMetaV2StorageFields({ storagePreview, storageOriginal });

  const payload = {
    schema_version: DOC_META_SCHEMA_V2,
    upload_pipeline: uploadPipeline,
    display_name: displayName,
    archivo_nombre: archivoNombre || displayName,
    mime_type: mimeType || "image/jpeg",
    size_bytes: sizeBytes ?? sizePreviewBytes ?? 0,
    size_preview_bytes: sizePreviewBytes ?? sizeBytes ?? 0,
    size_original_bytes: sizeOriginalBytes ?? null,
    width,
    height,
    preview_url: resolvedPreviewUrl,
    original_url: resolvedOriginalUrl,
    bucket: v2.bucket,
    path_preview: v2.path_preview,
    path_original: v2.path_original,
    signed_expires_at: v2.signed_expires_at,
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
  return payload;
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

function evidenceMimeType(ev, meta) {
  return meta?.mime_type || ev?.mime_type || ev?.datos?.mime_type || "";
}

/** HEIC/HEIF y similares: el navegador suele mostrarlos desaturados; usar preview JPEG. */
function isBrowserFriendlyImageMime(mime) {
  const m = String(mime || "").toLowerCase();
  return (
    m.includes("jpeg") ||
    m.includes("jpg") ||
    m.includes("png") ||
    m.includes("webp") ||
    m.includes("gif")
  );
}

function isBrowserFriendlyImageUrl(url) {
  const u = String(url || "").toLowerCase().split("?")[0];
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u);
}

function urlHintsHeicOrRawStorage(url) {
  const u = String(url || "").toLowerCase().split("?")[0];
  return /\.(heic|heif)$/i.test(u) || u.includes("/original/");
}

/** URL para UI/visor: prioriza JPEG preview (evita HEIC en columna url / iOS). */
export function resolveEvidenciaDisplayImageUrl(ev) {
  const meta = getDocMeta(ev);
  const original = meta?.original_url || ev?.originalUrl || null;
  const preview = meta?.preview_url || ev?.previewUrl || null;
  const legacyUrl = ev?.url || null;
  const mime = evidenceMimeType(ev, meta);
  const tipo = ev?.tipo || meta?.tipo_documento || "";

  let chosen;
  let source;

  if (preview && (tipo === "foto" || tipo === "cmr")) {
    chosen = preview;
    source = "preview_url_tipo";
  } else if (preview && original && original !== preview && (urlHintsHeicOrRawStorage(original) || !isBrowserFriendlyImageUrl(original))) {
    chosen = preview;
    source = "preview_url_heic_safe";
  } else if (preview && legacyUrl && urlHintsHeicOrRawStorage(legacyUrl)) {
    chosen = preview;
    source = "preview_url_legacy_heic";
  } else if (preview && (!original || !isBrowserFriendlyImageMime(mime))) {
    chosen = preview;
    source = "preview_url_preferred";
  } else {
    chosen = preview || (!urlHintsHeicOrRawStorage(original) ? original : null) || legacyUrl || original;
    source =
      chosen === preview
        ? "preview_url"
        : chosen === original
          ? "original_url"
          : chosen === legacyUrl
            ? "evidencias.url"
            : "none";
  }

  if (isOperationalDocTraceEnabled()) {
    traceOperationalDoc("resolveEvidenciaDisplayImageUrl", {
      fn: "resolveEvidenciaDisplayImageUrl",
      evId: ev?.id ?? null,
      evTipo: ev?.tipo ?? meta?.tipo_documento ?? null,
      original_url: original,
      preview_url: preview,
      evidencias_url_column: legacyUrl,
      mime,
      chosen,
      source,
    });
  }
  return chosen;
}

/** URL para incrustar en PDF (JPEG / URL web-safe; nunca HEIC crudo). */
export function resolveEvidenciaPdfEmbedUrl(ev) {
  const meta = getDocMeta(ev);
  const preview = meta?.preview_url || ev?.previewUrl || null;
  const legacyUrl = ev?.url || null;
  const original = meta?.original_url || ev?.originalUrl || null;
  let chosen = preview;
  if (!chosen && legacyUrl && isBrowserFriendlyImageUrl(legacyUrl)) chosen = legacyUrl;
  if (!chosen && original && isBrowserFriendlyImageUrl(original)) chosen = original;
  if (!chosen) chosen = resolveEvidenciaDisplayImageUrl(ev) || legacyUrl;
  if (isOperationalDocTraceEnabled()) {
    traceOperationalDoc("resolveEvidenciaPdfEmbedUrl", {
      fn: "resolveEvidenciaPdfEmbedUrl",
      evId: ev?.id ?? null,
      preview_url: preview,
      chosen,
    });
  }
  return chosen;
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
