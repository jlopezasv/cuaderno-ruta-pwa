import { localFind } from "../../domain/route/routePlanning.js";

import {
  buildGeocodeQueryCandidates,
  enrichPlaceForGeo,
} from "../../domain/service/serviceOperationalPlaces.js";
import { lookupPostalCodeLocal } from "../../domain/geo/postalCodeLookup.js";
import { getStopOperacionMeta } from "../../domain/service/stopOperacionMeta.js";

/** País desambiguado para ciudades del catálogo local (demo / fallback). */

const CITY_COUNTRY = {

  Almería: "España",

  Madrid: "España",

  Barcelona: "España",

  Valencia: "España",

  Sevilla: "España",

  Zaragoza: "España",

  Málaga: "España",

  Bilbao: "España",

  Murcia: "España",

  Alicante: "España",

  Berlín: "Alemania",

  Hamburgo: "Alemania",

  Múnich: "Alemania",

  Frankfurt: "Alemania",

  Colonia: "Alemania",

  Stuttgart: "Alemania",

  París: "Francia",

  Lyon: "Francia",

  Marsella: "France",

  Toulouse: "Francia",

  Bruselas: "Bélgica",

  Ámsterdam: "Países Bajos",

  Londres: "Reino Unido",

  Lisboa: "Portugal",

  Porto: "Portugal",

  Roma: "Italia",

  Milán: "Italia",

  Praga: "República Checa",

  Viena: "Austria",

  Zúrich: "Suiza",

};



export function planificadorMapGeoLog(event, payload = {}) {

  if (!import.meta.env.DEV || typeof console === "undefined") return;

  console.info(`[planificador-mapa-beta] ${event}`, payload);

}



export function isFiniteCoordPair(lat, lon) {

  const la = Number(lat);

  const lo = Number(lon);

  return (

    Number.isFinite(la) &&

    Number.isFinite(lo) &&

    Math.abs(la) <= 90 &&

    Math.abs(lo) <= 180

  );

}



/** Área operativa esperada en mapa beta (España / Europa occidental-central). */

export function isPlausibleEuropeMapCoord(lat, lon) {

  if (!isFiniteCoordPair(lat, lon)) return false;

  const la = Number(lat);

  const lo = Number(lon);

  return la >= 30 && la <= 72 && lo >= -25 && lo <= 50;

}



/**

 * Corrige intercambio lat↔lon típico (p. ej. Almería guardada como -2.45, 36.83 → África).

 */

export function maybeFixSwappedLatLon(lat, lon) {

  if (!isFiniteCoordPair(lat, lon)) return { lat: null, lon: null, swapped: false };

  let la = Number(lat);

  let lo = Number(lon);

  if (isPlausibleEuropeMapCoord(la, lo)) {

    return { lat: la, lon: lo, swapped: false };

  }

  if (isPlausibleEuropeMapCoord(lo, la)) {

    return { lat: lo, lon: la, swapped: true };

  }

  return { lat: la, lon: lo, swapped: false };

}



/** Solo coordenadas persistidas en parada (no inferir desde texto). */

export function readExplicitStopCoords(stop) {
  if (!stop) return null;
  const meta = getStopOperacionMeta(stop?.notas);
  const lat = stop.lat ?? meta.geo_lat;
  const lon = stop.lon ?? meta.geo_lon;
  if (lat == null || lon == null || lat === "" || lon === "") return null;
  if (!isFiniteCoordPair(lat, lon)) return null;
  return { lat: Number(lat), lon: Number(lon) };
}



/** Texto explícito "lat, lon" en dirección (no geocodificar). */

export function readExplicitCoordText(text) {

  const s = String(text || "").trim();

  const m = s.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);

  if (!m) return null;

  const lat = Number(m[1]);

  const lon = Number(m[2]);

  if (!isFiniteCoordPair(lat, lon)) return null;

  return { lat, lon };

}



/**

 * Lookup local síncrono (catálogo CITIES). Solo demo / sin red.

 */

export function resolveDemoLocalCoords(text) {

  const q = String(text || "").trim();

  if (!q) return null;

  const hit = localFind(q);

  if (!hit || !isFiniteCoordPair(hit.lat, hit.lon)) return null;

  return {

    lat: Number(hit.lat),

    lon: Number(hit.lon),

    canonicalName: hit.name,

    query: q,

    confidence: "high",

  };

}



export function formatDisambiguatedPlaceLabel(text) {

  const raw = String(text || "").trim();

  if (!raw || raw === "—") return "—";

  const enriched = enrichPlaceForGeo({ nombre: raw });

  const lookup = enriched.canonical || raw;

  const hit = localFind(lookup);

  if (hit?.name) {

    const country = CITY_COUNTRY[hit.name];

    return country ? `${hit.name}, ${country}` : hit.name;

  }

  if (enriched.canonical && enriched.pais) {

    return `${enriched.canonical}, ${enriched.pais}`;

  }

  return raw;

}



function logRoleGeo(role, trace) {

  const label = role === "destino" ? "DESTINO" : "ORIGEN";

  planificadorMapGeoLog(label, {

    texto: trace.geocodeText || trace.lugarGeocode || null,

    coordenadas: trace.coords,

    confianza: trace.confidence,

    fuente: trace.source,

    empresa: trace.empresa,

  });

}



function finalizeGeoTrace(trace, role) {

  trace.pendingGeocode = !trace.coords;

  trace.pendingValidation = Boolean(trace.coords && trace.confidence === "low");

  trace.role = role;

  logRoleGeo(role, trace);

  return trace;

}



/**

 * Resuelve coordenadas de un extremo (origen o destino).

 * Prioridad: lat/lng almacenados → coord explícito → geocodificación demo (candidatos desambiguados).

 * Nunca empresa.

 */

export function resolvePlaceGeo({

  role = "origen",

  servicio = null,

  stop = null,

  place = null,

  fallbackText = "",

  isDemo = false,

}) {

  const stopMeta = getStopOperacionMeta(stop?.notas);
  const resolvedPlace = enrichPlaceForGeo(

    place || {

      nombre: stop?.nombre,

      direccion: stop?.direccion,

      provincia: stop?.provincia || stopMeta.provincia,

      pais: stop?.pais || stopMeta.pais,

      codigo_postal: stop?.codigo_postal || stopMeta.codigo_postal,

      empresa: stop?.empresa,

    },

  );

  const candidates = buildGeocodeQueryCandidates(resolvedPlace);

  const geocodeText = candidates[0] || String(fallbackText || "").trim() || "";

  const empresa = String(resolvedPlace?.empresa || "").trim() || null;

  const servicioCol = role === "destino" ? servicio?.destino : servicio?.origen;



  const trace = {

    role,

    servicioId: servicio?.id || null,

    empresa,

    geocodeText: geocodeText || null,

    lugarGeocode: geocodeText || null,

    candidates,

    stopId: stop?.id || null,

    stopNombre: stop?.nombre || null,

    stopDireccion: stop?.direccion || null,

    stopLat: stop?.lat ?? null,

    stopLon: stop?.lon ?? null,

    servicioColumn: servicioCol || null,

    source: null,

    coords: null,

    swapped: false,

    confidence: null,

    pendingGeocode: true,

    pendingValidation: false,

  };



  const stored = readExplicitStopCoords(stop);

  if (stored) {

    const fixed = maybeFixSwappedLatLon(stored.lat, stored.lon);

    trace.source = "stored_stop";

    trace.swapped = fixed.swapped;

    trace.coords = { lat: fixed.lat, lon: fixed.lon };

    trace.confidence = "stored";

    trace.geocodeText = geocodeText || "(coordenadas almacenadas)";

    return finalizeGeoTrace(trace, role);

  }



  const fromDir = readExplicitCoordText(stop?.direccion);

  const fromServicioCol = readExplicitCoordText(servicioCol);

  const explicit = fromDir || fromServicioCol;

  if (explicit) {

    const fixed = maybeFixSwappedLatLon(explicit.lat, explicit.lon);

    trace.source = fromDir ? "explicit_direccion" : "explicit_servicio_column";

    trace.swapped = fixed.swapped;

    trace.coords = { lat: fixed.lat, lon: fixed.lon };

    trace.confidence = isPlausibleEuropeMapCoord(fixed.lat, fixed.lon) ? "high" : "low";

    return finalizeGeoTrace(trace, role);

  }



  if (isDemo && resolvedPlace.codigo_postal) {
    const postalHit = lookupPostalCodeLocal(resolvedPlace.pais, resolvedPlace.codigo_postal);
    if (postalHit?.lat != null && postalHit?.lon != null && isPlausibleEuropeMapCoord(postalHit.lat, postalHit.lon)) {
      trace.source = "demo_postal_catalog";
      trace.coords = { lat: postalHit.lat, lon: postalHit.lon };
      trace.geocodeText = [resolvedPlace.codigo_postal, postalHit.ciudad, resolvedPlace.pais].filter(Boolean).join(", ");
      trace.confidence = "high";
      return finalizeGeoTrace(trace, role);
    }
  }

  if (isDemo && candidates.length) {

    for (const q of candidates) {

      const local = resolveDemoLocalCoords(q);

      if (!local) continue;

      if (!isPlausibleEuropeMapCoord(local.lat, local.lon)) {

        trace.confidence = "low";

        continue;

      }

      trace.source = "demo_local_catalog";

      trace.coords = { lat: local.lat, lon: local.lon };

      trace.geocodeText = q;

      trace.demoQuery = local.query;

      trace.canonicalName = local.canonicalName;

      trace.confidence = local.confidence || "high";

      return finalizeGeoTrace(trace, role);

    }

  }



  trace.coords = null;

  trace.confidence = geocodeText ? "low" : null;

  trace.source = trace.source || (geocodeText ? "sin_resolucion" : "sin_lugar");

  return finalizeGeoTrace(trace, role);

}



/** @deprecated Usar {@link resolvePlaceGeo} con role="origen". */

export function resolveCargoOriginGeo(params) {

  return resolvePlaceGeo({ ...params, role: "origen", stop: params.cargaStop, fallbackText: params.origenText });

}


