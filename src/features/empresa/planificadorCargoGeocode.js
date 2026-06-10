import { geocode } from "../../domain/route/routePlanning.js";
import {
  isPlausibleEuropeMapCoord,
  maybeFixSwappedLatLon,
} from "./planificadorMapGeo.js";

const cache = new Map();

function cacheKey(cargo) {
  const trace = cargo?.geoTrace || cargo?.origenGeoTrace;
  return `${cargo?.id || ""}:${trace?.geocodeText || cargo?.origenGeocode || ""}`;
}

function buildAsyncQueries(cargo) {
  const trace = cargo?.geoTrace || cargo?.origenGeoTrace;
  const base = Array.isArray(trace?.candidates) && trace.candidates.length
    ? [...trace.candidates]
    : [cargo?.origenGeocode || trace?.geocodeText].filter(Boolean);
  const out = [];
  const seen = new Set();
  const push = (q) => {
    const clean = String(q || "").trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };
  for (const q of base) {
    push(q);
    if (q && !/españa|spain|francia|france|portugal|italia|italy|alemania|germany/i.test(q)) {
      push(`${q}, España`);
    }
  }
  return out;
}

/**
 * Geocodifica en red el origen de una carga pendiente (Open-Meteo / Photon / Nominatim).
 * @returns {Promise<{ coords: {lat, lon}|null, failed: boolean, query?: string }>}
 */
export async function geocodePlanificadorCargoOrigin(cargo) {
  if (cargo?.hasCoords && cargo?.coords) {
    return { coords: cargo.coords, failed: false, source: "sync" };
  }
  const key = cacheKey(cargo);
  if (cache.has(key)) return cache.get(key);

  const queries = buildAsyncQueries(cargo);
  if (!queries.length) {
    const failed = { coords: null, failed: true, source: "no_query" };
    cache.set(key, failed);
    return failed;
  }

  for (const q of queries) {
    try {
      const hit = await geocode(q);
      const fixed = maybeFixSwappedLatLon(hit?.lat, hit?.lon);
      if (isPlausibleEuropeMapCoord(fixed.lat, fixed.lon)) {
        const ok = {
          coords: { lat: fixed.lat, lon: fixed.lon },
          failed: false,
          query: q,
          source: "async_geocode",
        };
        cache.set(key, ok);
        return ok;
      }
    } catch (_) {
      /* siguiente candidato */
    }
  }

  const failed = { coords: null, failed: true, source: "async_geocode" };
  cache.set(key, failed);
  return failed;
}

/** Enriquece filas de cargas pendientes con coordenadas resueltas en red. */
export async function enrichPlanificadorCargasWithGeocode(cargas) {
  const list = Array.isArray(cargas) ? cargas : [];
  const pending = list.filter((c) => !c.hasCoords);
  if (!pending.length) return list;

  const results = await Promise.all(
    pending.map(async (cargo) => {
      const geo = await geocodePlanificadorCargoOrigin(cargo);
      return { id: cargo.id, geo };
    }),
  );
  const byId = Object.fromEntries(results.map((r) => [r.id, r.geo]));

  return list.map((cargo) => {
    if (cargo.hasCoords) {
      return { ...cargo, locationStatus: cargo.pendingValidation ? "pending_validation" : "ready" };
    }
    const geo = byId[cargo.id];
    if (geo?.coords) {
      return {
        ...cargo,
        coords: geo.coords,
        hasCoords: true,
        pendingGeocode: false,
        pendingValidation: false,
        locationStatus: "ready",
        geocodedAsync: true,
        geocodeQuery: geo.query || null,
      };
    }
    return {
      ...cargo,
      coords: null,
      hasCoords: false,
      pendingGeocode: false,
      locationStatus: "missing",
      locationMissing: true,
    };
  });
}
