/** Punto GPS operativo (acciones muelle, fotos, etc.). */

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

export function appendGeoToDetail(detail, geo) {
  const line = formatOperationalGeoLine(geo);
  if (!line) return detail || "";
  const base = String(detail || "").trim();
  return base ? `${base} · ${line}` : line;
}

export function geoFromGpsPoint(point) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
  return {
    lat: point.lat,
    lon: point.lon,
    ts: point.ts || new Date().toISOString(),
    accuracy_m: point.accuracy != null ? Math.round(point.accuracy) : null,
  };
}

export function getGeoFromDocMeta(ev) {
  const meta = ev?.datos?.doc_meta;
  if (meta?.geo && Number.isFinite(Number(meta.geo.lat))) return meta.geo;
  const d = ev?.datos;
  if (d?.geo && Number.isFinite(Number(d.geo.lat))) return d.geo;
  return null;
}
