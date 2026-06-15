/** Punto GPS operativo (acciones muelle, fotos, etc.). */

export const GEO_SOURCE_LABEL = Object.freeze({
  gps: "GPS",
  cached: "caché reciente",
  browser: "navegador",
  manual: "manual",
  no_disponible: "no disponible",
});

export function formatOperationalGeoLine(geo) {
  const lng = geo?.lng ?? geo?.lon;
  if (!geo || !Number.isFinite(Number(geo.lat)) || !Number.isFinite(Number(lng))) return "";
  const lat = Number(geo.lat).toFixed(5);
  const lon = Number(lng).toFixed(5);
  const acc =
    geo.accuracy_m != null && Number.isFinite(Number(geo.accuracy_m))
      ? ` · ±${Math.round(Number(geo.accuracy_m))} m`
      : "";
  return `📍 ${lat}, ${lon}${acc}`;
}

const LOCATION_REASON_LABELS = {
  denied: "permiso denegado",
  timeout: "timeout",
  unavailable: "ubicación desactivada",
  unsupported: "no soportado",
  captured: "capturada",
  cached: "caché reciente",
  ok: "ok",
};

function geoReasonLabel(geo) {
  const status = String(geo?.location_status || "").toLowerCase();
  return geo?.location_error || LOCATION_REASON_LABELS[status] || status || "no disponible";
}

/** Línea legible para expediente operacional. */
export function formatExpedienteUbicacionLine(geo) {
  if (!geo) return "Ubicación no disponible";
  const lng = geo.lng ?? geo.lon;
  if (
    geo.source === "no_disponible" ||
    geo.location_status === "denied" ||
    geo.location_status === "timeout" ||
    geo.location_status === "unavailable" ||
    geo.location_status === "unsupported"
  ) {
    return `Ubicación no disponible (${geoReasonLabel(geo)})`;
  }
  if (!Number.isFinite(Number(geo.lat)) || !Number.isFinite(Number(lng))) {
    return `Ubicación no disponible (${geoReasonLabel(geo)})`;
  }
  const lat = Number(geo.lat).toFixed(4);
  const lon = Number(lng).toFixed(4);
  const acc =
    geo.accuracy_m != null && Number.isFinite(Number(geo.accuracy_m))
      ? ` · precisión ${Math.round(Number(geo.accuracy_m))} m`
      : "";
  const cacheNote = geo.location_status === "cached" || geo.source === "cached" ? " (caché)" : "";
  return `Ubicación: ${lat}, ${lon}${acc}${cacheNote}`;
}

/** Detalle para timeline conductor. */
export function formatDriverGeoTimelineLines(geo) {
  if (!geo) return [{ label: "Ubicación", value: "No disponible" }];
  const lng = geo.lng ?? geo.lon;
  if (geo.source === "no_disponible" || !Number.isFinite(Number(geo.lat)) || !Number.isFinite(Number(lng))) {
    return [{ label: "Ubicación", value: `No disponible (${geoReasonLabel(geo)})` }];
  }
  const lines = [
    { label: "Ubicación", value: `${Number(geo.lat).toFixed(4)}, ${Number(lng).toFixed(4)}` },
  ];
  if (geo.accuracy_m != null && Number.isFinite(Number(geo.accuracy_m))) {
    lines.push({ label: "Precisión", value: `${Math.round(Number(geo.accuracy_m))} m` });
  }
  if (geo.location_status === "cached" || geo.source === "cached") {
    lines.push({ label: "Origen", value: "Ubicación reciente (caché)" });
  }
  return lines;
}

export function formatGeoSourceLabel(geo) {
  if (!geo?.source) return null;
  return GEO_SOURCE_LABEL[geo.source] || geo.source;
}

export function appendGeoToDetail(detail, geo) {
  const ubic = formatExpedienteUbicacionLine(geo);
  const base = String(detail || "").trim();
  return base ? `${base}\n${ubic}` : ubic;
}

export function geoFromGpsPoint(point, opts = {}) {
  const lng = point?.lng ?? point?.lon;
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(lng)) {
    if (opts.recordUnavailable) {
      return {
        ts: new Date().toISOString(),
        location_captured_at: new Date().toISOString(),
        source: "no_disponible",
        location_status: opts.location_status || "unavailable",
        location_error: opts.location_error || null,
      };
    }
    return null;
  }
  return {
    lat: point.lat,
    lng,
    lon: lng,
    ts: point.ts || point.location_captured_at || new Date().toISOString(),
    location_captured_at: point.location_captured_at || point.ts || new Date().toISOString(),
    accuracy_m: point.accuracy != null ? Math.round(point.accuracy) : null,
    source: point.source || opts.source || "gps",
    location_status: point.location_status || opts.location_status || "ok",
    location_error: point.location_error || null,
  };
}

/** Geo guardado en evento: coordenadas si hay GPS; si no, marca sin ubicación. */
export function resolveEventGeoFromOp(op) {
  const fromPoint = geoFromGpsPoint(op?.point);
  if (fromPoint) return fromPoint;
  return geoFromGpsPoint(null, {
    recordUnavailable: true,
    location_status: op?.location_status || op?.prefetchedGps?.location_status || "unavailable",
    location_error: op?.location_error || op?.prefetchedGps?.location_error || op?.error || null,
  });
}

export function getGeoFromDocMeta(ev) {
  const meta = ev?.datos?.doc_meta;
  if (meta?.geo && Number.isFinite(Number(meta.geo.lat))) return meta.geo;
  const d = ev?.datos;
  if (d?.geo && Number.isFinite(Number(d.geo.lat))) return d.geo;
  if (d?.geo?.source === "no_disponible") return d.geo;
  return null;
}
