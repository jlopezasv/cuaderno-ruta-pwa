/** Punto GPS operativo (acciones muelle, fotos, etc.). */

export const GEO_SOURCE_LABEL = Object.freeze({
  gps: "GPS",
  browser: "navegador",
  manual: "manual",
  no_disponible: "no disponible",
});

export function formatOperationalGeoLine(geo) {
  if (!geo || !Number.isFinite(Number(geo.lat)) || !Number.isFinite(Number(geo.lon))) return "";
  const lat = Number(geo.lat).toFixed(5);
  const lon = Number(geo.lon).toFixed(5);
  const acc =
    geo.accuracy_m != null && Number.isFinite(Number(geo.accuracy_m))
      ? ` · ±${Math.round(Number(geo.accuracy_m))} m`
      : "";
  return `📍 ${lat}, ${lon}${acc}`;
}

/** Línea legible para expediente operacional. */
export function formatExpedienteUbicacionLine(geo) {
  if (!geo || geo.source === "no_disponible" || !Number.isFinite(Number(geo.lat)) || !Number.isFinite(Number(geo.lon))) {
    return "Ubicación no registrada";
  }
  const lat = Number(geo.lat).toFixed(4);
  const lon = Number(geo.lon).toFixed(4);
  const acc =
    geo.accuracy_m != null && Number.isFinite(Number(geo.accuracy_m))
      ? ` · precisión ${Math.round(Number(geo.accuracy_m))} m`
      : "";
  return `Ubicación: ${lat}, ${lon}${acc}`;
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
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
    if (opts.recordUnavailable) {
      return {
        ts: new Date().toISOString(),
        source: "no_disponible",
      };
    }
    return null;
  }
  return {
    lat: point.lat,
    lon: point.lon,
    ts: point.ts || new Date().toISOString(),
    accuracy_m: point.accuracy != null ? Math.round(point.accuracy) : null,
    source: point.source || opts.source || "gps",
  };
}

/** Geo guardado en evento: coordenadas si hay GPS; si no, marca sin ubicación. */
export function resolveEventGeoFromOp(op) {
  const fromPoint = geoFromGpsPoint(op?.point);
  if (fromPoint) return fromPoint;
  return geoFromGpsPoint(null, { recordUnavailable: true });
}

export function getGeoFromDocMeta(ev) {
  const meta = ev?.datos?.doc_meta;
  if (meta?.geo && Number.isFinite(Number(meta.geo.lat))) return meta.geo;
  const d = ev?.datos;
  if (d?.geo && Number.isFinite(Number(d.geo.lat))) return d.geo;
  if (d?.geo?.source === "no_disponible") return d.geo;
  return null;
}
