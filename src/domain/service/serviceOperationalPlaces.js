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

const normPlaceKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

/** Pistas demo / desambiguación (lugar → provincia + país). Nunca empresa. */
const GEO_PLACE_HINTS = {
  "el ejido": { provincia: "Almería", pais: "España", canonical: "Almería" },
  ejido: { provincia: "Almería", pais: "España", canonical: "Almería" },
  marsella: { provincia: "Bouches-du-Rhône", pais: "France", canonical: "Marsella" },
  marseille: { provincia: "Bouches-du-Rhône", pais: "France", canonical: "Marsella" },
};

function isCompleteAddress(direccion) {
  const d = String(direccion || "").trim();
  if (!d) return false;
  if (d.includes(",")) return true;
  return /\b(calle|av\.?|avenida|carretera|ctra\.?|pol[ií]gono|pg\.?ind|km|n[º°o]|pasaje|plaza|p\.e\.|urbanizaci[oó]n)\b/i.test(
    d,
  );
}

function pickPlaceFromStop(stop) {
  if (!stop) {
    return { nombre: "", direccion: "", empresa: "", provincia: "", pais: "", codigo_postal: "" };
  }
  const meta = getStopOperacionMeta(stop?.notas);
  return {
    nombre: String(stop.nombre || "").trim(),
    direccion: String(stop.direccion || "").trim(),
    provincia: String(stop.provincia || meta.provincia || "").trim(),
    pais: String(stop.pais || meta.pais || "").trim(),
    codigo_postal: String(stop.codigo_postal || meta.codigo_postal || "").trim(),
    empresa:
      String(stop?.empresa || "").trim() ||
      String(meta.empresa_logistica || meta.empresa || "").trim(),
  };
}

/** Enriquece lugar con provincia/país inferidos (demo / alias). */
export function enrichPlaceForGeo(place) {
  const p = place || {};
  const nombre = String(p.nombre || "").trim();
  const hint = GEO_PLACE_HINTS[normPlaceKey(nombre)];
  return {
    nombre,
    direccion: String(p.direccion || "").trim(),
    provincia: String(p.provincia || hint?.provincia || "").trim(),
    pais: String(p.pais || hint?.pais || "").trim(),
    codigo_postal: String(p.codigo_postal || "").trim(),
    empresa: String(p.empresa || "").trim(),
    canonical: hint?.canonical || "",
  };
}

/**
 * Candidatos de geocodificación (mapas / rutas). Nunca empresa/muelle.
 * Prioridad: CP+ciudad+país → ciudad+país → fallbacks legacy (sin CP).
 */
export function buildGeocodeQueryCandidates(place) {
  const p = enrichPlaceForGeo(place);
  const nombre = p.nombre;
  const direccion = p.direccion;
  const provincia = p.provincia;
  const pais = p.pais;
  const cp = p.codigo_postal;
  const out = [];
  const push = (value) => {
    const clean = String(value || "").trim();
    if (!clean) return;
    if (!out.some((x) => normPlaceKey(x) === normPlaceKey(clean))) out.push(clean);
  };

  if (cp && nombre && pais) push([cp, nombre, pais].join(", "));
  if (nombre && pais) push([nombre, pais].join(", "));
  if (cp && !nombre && pais) push([cp, pais].join(", "));

  if (!cp) {
    if (nombre && provincia && pais) push([nombre, provincia, pais].join(", "));
    if (p.canonical && pais) push([p.canonical, pais].filter(Boolean).join(", "));
    if (direccion) {
      const addrParts = [direccion, nombre, pais].filter(Boolean).join(", ");
      if (addrParts) push(addrParts);
      if (isCompleteAddress(direccion)) push(direccion);
    }
    if (nombre) push(nombre);
  }

  return out;
}

/** Consulta principal para geocodificar / calcular ruta. */
export function geocodeQueryFromPlace(place) {
  return buildGeocodeQueryCandidates(place)[0] || "";
}

/** Evita usar «Origen → Destino» como texto de un solo extremo. */
export function sanitizeRouteEndpointFallback(text, role = "origen") {
  const s = String(text || "").trim();
  if (!s) return "";
  const parts = s.split(/\s*(?:→|->)\s*/);
  if (parts.length >= 2) {
    return role === "destino" ? parts[parts.length - 1].trim() : parts[0].trim();
  }
  return s;
}

/** Etiqueta visible de localidad (origen/destino en UI). Nunca empresa. */
export function displayLugarFromPlace(place) {
  const p = place || {};
  const nombre = String(p.nombre || "").trim();
  const cp = String(p.codigo_postal || "").trim();
  const direccion = String(p.direccion || "").trim();
  if (nombre && cp) return `${nombre} (${cp})`;
  if (nombre) return nombre;
  if (cp && p.pais) return `${cp}, ${p.pais}`;
  if (direccion) return direccion;
  return "";
}

/** @deprecated Alias de {@link geocodeQueryFromPlace} — no usar empresa. */
export function routePointTextFromPlace(place) {
  return geocodeQueryFromPlace(place);
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
  let carga = { nombre: "", direccion: "", empresa: "", provincia: "", pais: "", codigo_postal: "" };
  let descarga = { nombre: "", direccion: "", empresa: "", provincia: "", pais: "", codigo_postal: "" };
  for (const st of sorted) {
    if (isCargaTipo(st.tipo)) {
      carga = pickPlaceFromStop(st);
      break;
    }
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

/** Origen/destino para columnas servicio y calculador (primera carga, primera descarga). */
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
    carga_codigo_postal: carga.codigo_postal,
    carga_pais: carga.pais,
    carga_provincia: carga.provincia,
    descarga_nombre: descarga.nombre,
    descarga_empresa: descarga.empresa,
    descarga_direccion: descarga.direccion,
    descarga_codigo_postal: descarga.codigo_postal,
    descarga_pais: descarga.pais,
    descarga_provincia: descarga.provincia,
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
    : {
        carga: { nombre: "", direccion: "", empresa: "", provincia: "", pais: "", codigo_postal: "" },
        descarga: { nombre: "", direccion: "", empresa: "", provincia: "", pais: "", codigo_postal: "" },
      };
  const legacyCarga = placeFromLegacyColumn(servicio?.origen);
  const legacyDescarga = placeFromLegacyColumn(servicio?.destino);
  const preferStopsRoute = Array.isArray(stops) && stops.length > 0;

  const cliente_nombre =
    String(lugares.cliente_nombre || meta.cliente_nombre || "").trim() ||
    String(servicio?.cliente_nombre || servicio?.cliente || meta.cliente || "").trim() ||
    "";

  const carga_nombre = preferStopsRoute
    ? String(fromStops.carga.nombre || "").trim() ||
      String(lugares.carga_nombre || "").trim() ||
      legacyCarga.nombre ||
      ""
    : String(lugares.carga_nombre || "").trim() ||
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
  const carga_codigo_postal =
    String(lugares.carga_codigo_postal || "").trim() ||
    fromStops.carga.codigo_postal ||
    "";
  const carga_pais =
    String(lugares.carga_pais || "").trim() ||
    fromStops.carga.pais ||
    "";
  const carga_provincia =
    String(lugares.carga_provincia || "").trim() ||
    fromStops.carga.provincia ||
    "";
  const descarga_nombre = preferStopsRoute
    ? String(fromStops.descarga.nombre || "").trim() ||
      String(lugares.descarga_nombre || "").trim() ||
      legacyDescarga.nombre ||
      ""
    : String(lugares.descarga_nombre || "").trim() ||
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
  const descarga_codigo_postal =
    String(lugares.descarga_codigo_postal || "").trim() ||
    fromStops.descarga.codigo_postal ||
    "";
  const descarga_pais =
    String(lugares.descarga_pais || "").trim() ||
    fromStops.descarga.pais ||
    "";
  const descarga_provincia =
    String(lugares.descarga_provincia || "").trim() ||
    fromStops.descarga.provincia ||
    "";

  return {
    cliente_nombre,
    carga_nombre,
    carga_empresa,
    carga_direccion,
    carga_codigo_postal,
    carga_pais,
    carga_provincia,
    descarga_nombre,
    descarga_empresa,
    descarga_direccion,
    descarga_codigo_postal,
    descarga_pais,
    descarga_provincia,
  };
}

/** Texto para geocoding / columnas `origen` y `destino` (sin cliente ni empresa). */
export function routeTextFromOperationalPlaces(places) {
  return {
    origen: geocodeQueryFromPlace({
      nombre: places?.carga_nombre,
      direccion: places?.carga_direccion,
      provincia: places?.carga_provincia,
      pais: places?.carga_pais,
      codigo_postal: places?.carga_codigo_postal,
    }),
    destino: geocodeQueryFromPlace({
      nombre: places?.descarga_nombre,
      direccion: places?.descarga_direccion,
      provincia: places?.descarga_provincia,
      pais: places?.descarga_pais,
      codigo_postal: places?.descarga_codigo_postal,
    }),
  };
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
  carga_codigo_postal = "",
  carga_pais = "",
  carga_provincia = "",
  descarga_nombre = "",
  descarga_empresa = "",
  descarga_direccion = "",
  descarga_codigo_postal = "",
  descarga_pais = "",
  descarga_provincia = "",
} = {}) {
  const patch = {
    lugares_operativos: {
      cliente_nombre: String(cliente_nombre || "").trim() || null,
      carga_nombre: String(carga_nombre || "").trim() || null,
      carga_empresa: String(carga_empresa || "").trim() || null,
      carga_direccion: String(carga_direccion || "").trim() || null,
      carga_codigo_postal: String(carga_codigo_postal || "").trim() || null,
      carga_pais: String(carga_pais || "").trim() || null,
      carga_provincia: String(carga_provincia || "").trim() || null,
      descarga_nombre: String(descarga_nombre || "").trim() || null,
      descarga_empresa: String(descarga_empresa || "").trim() || null,
      descarga_direccion: String(descarga_direccion || "").trim() || null,
      descarga_codigo_postal: String(descarga_codigo_postal || "").trim() || null,
      descarga_pais: String(descarga_pais || "").trim() || null,
      descarga_provincia: String(descarga_provincia || "").trim() || null,
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
