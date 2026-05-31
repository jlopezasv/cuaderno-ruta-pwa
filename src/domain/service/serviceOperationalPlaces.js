import { getServicioOperacionMeta } from "./serviceOperacionMeta.js";
import { getStopOperacionMeta } from "./stopOperacionMeta.js";

/** Paradas con tipo carga (incl. carga_descarga, muelle). */
function isCargaTipo(tipo) {
  const t = String(tipo || "").toLowerCase();
  return /\bcarga\b/.test(t) || /carga_descarga|muelle/.test(t);
}

/** Paradas con tipo descarga. */
function isDescargaTipo(tipo) {
  const t = String(tipo || "").toLowerCase();
  return /\bdescarga\b/.test(t) || /solo_descarga/.test(t);
}

function pickPlaceFromStop(stop) {
  if (!stop) return { nombre: "", direccion: "", empresa: "" };
  const meta = getStopOperacionMeta(stop?.notas);
  return {
    nombre: String(stop.nombre || "").trim(),
    direccion: String(stop.direccion || "").trim(),
    empresa:
      String(stop?.empresa || "").trim() ||
      String(meta.empresa_logistica || meta.empresa || "").trim(),
  };
}

/** Texto para ruta: dirección → lugar → empresa. */
export function routePointTextFromPlace(place) {
  const p = place || {};
  return String(p.direccion || p.nombre || p.empresa || "").trim();
}

export function routePointTextFromStop(stop) {
  return routePointTextFromPlace(pickPlaceFromStop(stop));
}

function placeFromLegacyColumn(value) {
  const t = String(value || "").trim();
  if (!t) return { nombre: "", direccion: "" };
  if (/^-?\d{1,2}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(t)) {
    return { nombre: "", direccion: t };
  }
  if (/^(ubicaci[oó]n actual|ubicaci[oó]n gps detectada|origen gps)$/i.test(t)) {
    return { nombre: t, direccion: "" };
  }
  return { nombre: t, direccion: "" };
}

/**
 * Extrae carga/descarga de paradas ordenadas (sin mezclar con cliente).
 */
export function deriveOperationalPlacesFromStops(stops) {
  const sorted = Array.isArray(stops)
    ? [...stops].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
    : [];
  let carga = { nombre: "", direccion: "", empresa: "" };
  let descarga = { nombre: "", direccion: "", empresa: "" };
  for (const st of sorted) {
    if (isCargaTipo(st.tipo)) carga = pickPlaceFromStop(st);
  }
  for (const st of sorted) {
    if (isDescargaTipo(st.tipo)) {
      descarga = pickPlaceFromStop(st);
      break;
    }
  }
  if (!carga.nombre && !carga.direccion && !carga.empresa && sorted.length) {
    const first = sorted.find((s) => isCargaTipo(s.tipo)) || sorted[0];
    carga = pickPlaceFromStop(first);
  }
  if (!descarga.nombre && !descarga.direccion && !descarga.empresa && sorted.length) {
    const last = [...sorted].reverse().find((s) => isDescargaTipo(s.tipo)) || sorted[sorted.length - 1];
    descarga = pickPlaceFromStop(last);
  }
  return { carga, descarga };
}

/** Origen/destino para columnas servicio y calculador (última carga, primera descarga). */
export function routeTextFromStops(stops) {
  const { carga, descarga } = deriveOperationalPlacesFromStops(stops);
  return {
    origen: routePointTextFromPlace(carga),
    destino: routePointTextFromPlace(descarga),
  };
}

/** Snapshot para meta `lugares_operativos` (sin tocar columnas legacy en BD). */
export function operationalPlacesFromStops(stops, cliente = "") {
  const { carga, descarga } = deriveOperationalPlacesFromStops(stops);
  return {
    cliente_nombre: String(cliente || "").trim(),
    carga_nombre: carga.nombre,
    carga_empresa: carga.empresa,
    carga_direccion: carga.direccion,
    descarga_nombre: descarga.nombre,
    descarga_empresa: descarga.empresa,
    descarga_direccion: descarga.direccion,
  };
}

/**
 * @typedef {object} ServiceOperationalPlaces
 * @property {string} cliente_nombre
 * @property {string} carga_nombre — localidad / lugar (ruta, mapas, ETA)
 * @property {string} carga_empresa — contexto logístico (planta, operador…)
 * @property {string} carga_direccion
 * @property {string} descarga_nombre
 * @property {string} descarga_empresa
 * @property {string} descarga_direccion
 */

/**
 * Lugares operativos canónicos (meta `lugares_operativos` + columnas + paradas).
 * @returns {ServiceOperationalPlaces}
 */
export function getServiceOperationalPlaces(servicio, stops = null) {
  const meta = getServicioOperacionMeta(servicio);
  const lugares = meta.lugares_operativos && typeof meta.lugares_operativos === "object"
    ? meta.lugares_operativos
    : {};

  const fromStops = stops?.length
    ? deriveOperationalPlacesFromStops(stops)
    : { carga: { nombre: "", direccion: "", empresa: "" }, descarga: { nombre: "", direccion: "", empresa: "" } };
  const legacyCarga = placeFromLegacyColumn(servicio?.origen);
  const legacyDescarga = placeFromLegacyColumn(servicio?.destino);

  const cliente_nombre =
    String(lugares.cliente_nombre || meta.cliente_nombre || "").trim() ||
    String(servicio?.cliente_nombre || servicio?.cliente || meta.cliente || "").trim() ||
    "";

  const carga_nombre =
    String(lugares.carga_nombre || "").trim() ||
    fromStops.carga.nombre ||
    legacyCarga.nombre ||
    "";
  const carga_direccion =
    String(lugares.carga_direccion || "").trim() ||
    fromStops.carga.direccion ||
    legacyCarga.direccion ||
    "";
  const carga_empresa =
    String(lugares.carga_empresa || "").trim() ||
    fromStops.carga.empresa ||
    "";
  const descarga_nombre =
    String(lugares.descarga_nombre || "").trim() ||
    fromStops.descarga.nombre ||
    legacyDescarga.nombre ||
    "";
  const descarga_direccion =
    String(lugares.descarga_direccion || "").trim() ||
    fromStops.descarga.direccion ||
    legacyDescarga.direccion ||
    "";
  const descarga_empresa =
    String(lugares.descarga_empresa || "").trim() ||
    fromStops.descarga.empresa ||
    "";

  return {
    cliente_nombre,
    carga_nombre,
    carga_empresa,
    carga_direccion,
    descarga_nombre,
    descarga_empresa,
    descarga_direccion,
  };
}

/** Texto para geocoding / columnas `origen` y `destino` (sin cliente). */
export function routeTextFromOperationalPlaces(places) {
  const carga =
    places?.carga_direccion || places?.carga_nombre || places?.carga_empresa || "";
  const descarga =
    places?.descarga_direccion || places?.descarga_nombre || places?.descarga_empresa || "";
  return { origen: String(carga).trim(), destino: String(descarga).trim() };
}

/** Línea de ruta visible: «Antequera → Pamplona». */
export function formatOperationalRouteLine(places) {
  const carga = String(places?.carga_nombre || "").trim() || "—";
  const descarga = String(places?.descarga_nombre || "").trim() || "—";
  return `${carga} → ${descarga}`;
}

/**
 * Presentación UI: cliente arriba, ruta debajo.
 */
export function getServiceOperationalPresentation(servicio, stops = null) {
  const places = getServiceOperationalPlaces(servicio, stops);
  const routeLine = formatOperationalRouteLine(places);
  const { origen, destino } = routeTextFromOperationalPlaces(places);
  return {
    places,
    clienteNombre: places.cliente_nombre || "",
    routeLine,
    origen,
    destino,
  };
}

export function buildOperationalPlacesMetaPatch({
  cliente_nombre = "",
  carga_nombre = "",
  carga_empresa = "",
  carga_direccion = "",
  descarga_nombre = "",
  descarga_empresa = "",
  descarga_direccion = "",
} = {}) {
  const patch = {
    lugares_operativos: {
      cliente_nombre: String(cliente_nombre || "").trim() || null,
      carga_nombre: String(carga_nombre || "").trim() || null,
      carga_empresa: String(carga_empresa || "").trim() || null,
      carga_direccion: String(carga_direccion || "").trim() || null,
      descarga_nombre: String(descarga_nombre || "").trim() || null,
      descarga_empresa: String(descarga_empresa || "").trim() || null,
      descarga_direccion: String(descarga_direccion || "").trim() || null,
    },
  };
  const cn = String(cliente_nombre || "").trim();
  if (cn) patch.cliente_nombre = cn;
  return patch;
}

/**
 * Tokens para búsqueda (cliente, conductor, matrícula, ref, ruta, lugares).
 */
export function buildServicioSearchHaystack(servicio, { stops = [], conductor = null } = {}) {
  const pres = getServiceOperationalPresentation(servicio, stops);
  const p = pres.places;
  const parts = [
    pres.clienteNombre,
    p.carga_nombre,
    p.carga_empresa,
    p.carga_direccion,
    p.descarga_nombre,
    p.descarga_empresa,
    p.descarga_direccion,
    pres.routeLine,
    pres.origen,
    pres.destino,
    servicio?.service_number,
    servicio?.referencia_cliente,
    servicio?.matricula,
    conductor?.nombre,
    conductor?.matricula,
  ];
  for (const st of stops || []) {
    parts.push(st?.nombre, st?.direccion, st?.tipo);
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function servicioMatchesSearchQuery(servicio, query, ctx = {}) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const hay = buildServicioSearchHaystack(servicio, ctx);
  return hay.includes(q);
}
