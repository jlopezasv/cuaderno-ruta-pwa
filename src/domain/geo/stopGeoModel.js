import { defaultStopCountry } from "./postalCodeLookup.js";
import { formatStopNotesForDisplay, getStopOperacionMeta, mergeStopOperacionMeta } from "../service/stopOperacionMeta.js";

const GEO_META_KEYS = ["pais", "codigo_postal", "provincia", "geo_lat", "geo_lon", "empresa_logistica"];

/** Estado de formulario de parada con campos geográficos europeos. */
export function emptyStopGeoForm(overrides = {}) {
  return {
    orden: 1,
    tipo: "carga",
    pais: defaultStopCountry(),
    codigo_postal: "",
    nombre: "",
    provincia: "",
    empresa: "",
    direccion: "",
    detalles: "",
    notas: "",
    lat: null,
    lon: null,
    ...overrides,
  };
}

/** Lee parada BD + meta → formulario geo. Compatible con servicios antiguos. */
export function stopRowToGeoForm(row) {
  if (!row) return emptyStopGeoForm();
  const meta = getStopOperacionMeta(row?.notas);
  const detalles = formatStopNotesForDisplay(row?.notas) || "";
  const lat = row.lat ?? meta.geo_lat ?? null;
  const lon = row.lon ?? meta.geo_lon ?? null;
  return {
    orden: Number(row.orden) || 0,
    tipo: row.tipo || "parada",
    pais: String(meta.pais || "").trim() || defaultStopCountry(),
    codigo_postal: String(meta.codigo_postal || "").trim(),
    nombre: String(row.nombre || "").trim(),
    provincia: String(meta.provincia || "").trim(),
    empresa: String(row.empresa || meta.empresa_logistica || meta.empresa || "").trim(),
    direccion: String(row.direccion || "").trim(),
    detalles,
    notas: detalles,
    lat: lat == null || lat === "" ? null : Number(lat),
    lon: lon == null || lon === "" ? null : Number(lon),
  };
}

/** Objeto lugar para geocodificación / mapas. */
export function stopGeoToPlace(stop) {
  const s = stop || {};
  return {
    nombre: String(s.nombre || "").trim(),
    direccion: String(s.direccion || "").trim(),
    provincia: String(s.provincia || "").trim(),
    pais: String(s.pais || "").trim(),
    codigo_postal: String(s.codigo_postal || "").trim(),
    empresa: String(s.empresa || "").trim(),
  };
}

/** Fusiona campos geo en `notas` (meta) antes de persistir. */
export function prepareStopRowForPersist(stop) {
  const detalles = String(stop.detalles ?? stop.notas ?? "").trim();
  const metaPatch = {
    pais: String(stop.pais || "").trim() || null,
    codigo_postal: String(stop.codigo_postal || "").trim() || null,
    provincia: String(stop.provincia || "").trim() || null,
    empresa_logistica: String(stop.empresa || "").trim() || null,
    geo_lat: stop.lat != null && stop.lat !== "" ? Number(stop.lat) : null,
    geo_lon: stop.lon != null && stop.lon !== "" ? Number(stop.lon) : null,
  };
  const notas = mergeStopOperacionMeta(detalles, metaPatch);
  return {
    orden: stop.orden,
    tipo: stop.tipo,
    nombre: String(stop.nombre || "").trim(),
    direccion: String(stop.direccion || "").trim() || null,
    notas: notas || null,
    lat: stop.lat,
    lon: stop.lon,
    empresa: stop.empresa,
  };
}

export function prepareStopsGeoForPersist(stops) {
  return (Array.isArray(stops) ? stops : []).map(prepareStopRowForPersist);
}

/** Resumen compacto para listados. */
export function formatStopGeoSummary(stop) {
  const ciudad = String(stop?.nombre || "").trim() || "—";
  const cp = String(stop?.codigo_postal || "").trim();
  const emp = String(stop?.empresa || "").trim();
  const loc = cp ? `${ciudad} (${cp})` : ciudad;
  return emp ? `${loc} · ${emp}` : loc;
}

export function stopMissingPostalWarning(stop) {
  return !String(stop?.codigo_postal || "").trim();
}

export { GEO_META_KEYS };
