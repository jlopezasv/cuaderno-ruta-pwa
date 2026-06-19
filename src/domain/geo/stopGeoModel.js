import { defaultStopCountry } from "./postalCodeLookup.js";
import { formatStopNotesForDisplay, getStopOperacionMeta, mergeStopOperacionMeta } from "../service/stopOperacionMeta.js";
import { getServicioMercanciaFromMeta } from "../dcdt/servicioMercanciaMeta.js";
import { emptyStopMercancia, getStopMercanciaFromStop, stopMercanciaFormPatch } from "../dcdt/stopMercanciaMeta.js";

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
    parte_transporte_id: null,
    parte_transporte_tipo: null,
    cargador_parte_id: null,
    mercancia: emptyStopMercancia(),
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
  const parteId = meta.parte_transporte_id || null;
  const cargadorParteId = meta.cargador_parte_id || null;
  return {
    id: row.id || null,
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
    parte_transporte_id: parteId ? String(parteId) : null,
    parte_transporte_tipo: meta.parte_transporte_tipo || null,
    cargador_parte_id: cargadorParteId ? String(cargadorParteId) : null,
    mercancia: getStopMercanciaFromStop(row),
  };
}

/**
 * Hidrata formularios de parada desde filas persistidas (+ migración mercancía legacy en servicio).
 */
export function hydrateStopFormsFromRows(rows, servicio = null) {
  const forms = (Array.isArray(rows) ? rows : []).map(stopRowToGeoForm);
  if (!servicio) return forms;
  const svcMerc = getServicioMercanciaFromMeta(servicio);
  const hasSvc =
    svcMerc.descripcion ||
    svcMerc.peso_kg ||
    svcMerc.bultos ||
    svcMerc.palets;
  if (!hasSvc) return forms;
  const idx = forms.findIndex((s) => String(s.tipo || "").toLowerCase() === "carga");
  if (idx < 0) return forms;
  const cur = getStopMercanciaFromStop(forms[idx]);
  const hasStop =
    cur.descripcion ||
    cur.peso_kg ||
    cur.bultos ||
    cur.palets;
  if (hasStop) return forms;
  const next = [...forms];
  next[idx] = { ...next[idx], mercancia: svcMerc };
  return next;
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
  const isDescarga = String(stop?.tipo || "").toLowerCase() === "descarga";
  const isCarga = String(stop?.tipo || "").toLowerCase() === "carga";
  const metaPatch = {
    pais: String(stop.pais || "").trim() || null,
    codigo_postal: String(stop.codigo_postal || "").trim() || null,
    provincia: String(stop.provincia || "").trim() || null,
    empresa_logistica: String(stop.empresa || "").trim() || null,
    geo_lat: stop.lat != null && stop.lat !== "" ? Number(stop.lat) : null,
    geo_lon: stop.lon != null && stop.lon !== "" ? Number(stop.lon) : null,
    parte_transporte_id: stop.parte_transporte_id || null,
    parte_transporte_tipo: stop.parte_transporte_tipo || null,
    cargador_parte_id: isDescarga ? stop.cargador_parte_id || null : null,
    ...(isCarga ? stopMercanciaFormPatch(stop) : {}),
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
