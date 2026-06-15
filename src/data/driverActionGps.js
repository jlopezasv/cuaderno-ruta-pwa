/** GPS unificado para acciones operativas del conductor (demo + prod). */

import { isDemoApp } from "../config/appEnvironment.js";

export const LOCATION_STATUS = Object.freeze({
  CAPTURED: "captured",
  CACHED: "cached",
  OK: "ok",
  DENIED: "denied",
  UNAVAILABLE: "unavailable",
  TIMEOUT: "timeout",
  UNSUPPORTED: "unsupported",
});

const CACHE_FALLBACK_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAXIMUM_AGE_MS = 60000;

let lastGoodPoint = null;
let lastGoodCapturedAt = 0;

function gpsActionLog(payload) {
  if (!isDemoApp()) return;
  console.log("[GPS acción]", payload);
}

function gpsActionErrorMessage(error) {
  if (error?.code === 1) return "Permiso de ubicación denegado";
  if (error?.code === 2) return "Ubicación no disponible";
  if (error?.code === 3) return "Tiempo de espera GPS agotado";
  return error?.message || "No se pudo obtener ubicación";
}

function locationStatusFromError(error) {
  if (error?.code === 1) return LOCATION_STATUS.DENIED;
  if (error?.code === 3) return LOCATION_STATUS.TIMEOUT;
  if (error?.code === 2) return LOCATION_STATUS.UNAVAILABLE;
  return LOCATION_STATUS.UNAVAILABLE;
}

function normalizePoint(pos, { source = "gps", locationStatus = LOCATION_STATUS.CAPTURED } = {}) {
  const { latitude: lat, longitude: lng, accuracy, speed } = pos?.coords || pos || {};
  const lon = lng ?? pos?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const capturedAt = new Date().toISOString();
  return {
    lat,
    lng: lon,
    lon,
    accuracy,
    speed,
    ts: capturedAt,
    location_captured_at: capturedAt,
    location_status: locationStatus,
    location_error: null,
    source,
  };
}

/**
 * @param {{ fresh?: boolean, timeoutMs?: number, highAccuracy?: boolean, maximumAge?: number }} [opts]
 */
export function getDriverActionGps(opts = {}) {
  const fresh = !!opts.fresh;
  const timeoutMs = Number.isFinite(opts.timeoutMs)
    ? Math.min(60000, Math.max(3000, opts.timeoutMs))
    : DEFAULT_TIMEOUT_MS;
  const maximumAge = Number.isFinite(opts.maximumAge)
    ? Math.min(300000, Math.max(0, opts.maximumAge))
    : fresh
      ? 0
      : DEFAULT_MAXIMUM_AGE_MS;
  const enableHighAccuracy = opts.highAccuracy !== false;

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({
      ok: false,
      error: "GPS no disponible en este dispositivo",
      location_status: LOCATION_STATUS.UNSUPPORTED,
      location_error: "GPS no disponible en este dispositivo",
    });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = normalizePoint(pos);
        if (!point) {
          resolve({
            ok: false,
            error: "Coordenadas GPS inválidas",
            location_status: LOCATION_STATUS.UNAVAILABLE,
            location_error: "Coordenadas GPS inválidas",
          });
          return;
        }
        resolve({
          ok: true,
          point,
          location_status: LOCATION_STATUS.CAPTURED,
        });
      },
      (error) => {
        const status = locationStatusFromError(error);
        const message = gpsActionErrorMessage(error);
        resolve({
          ok: false,
          error: message,
          location_status: status,
          location_error: message,
        });
      },
      { enableHighAccuracy, timeout: timeoutMs, maximumAge },
    );
  });
}

/**
 * Solicita ubicación para un evento operativo (único flujo para todas las acciones).
 * @param {string} eventType
 * @param {{ callingFunction?: string, timeoutMs?: number, allowCacheFallback?: boolean }} [opts]
 */
export async function requestActionLocation(eventType, opts = {}) {
  const callingFunction = opts.callingFunction || "requestActionLocation";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allowCacheFallback = opts.allowCacheFallback !== false;

  gpsActionLog({
    eventType: eventType || null,
    callingFunction,
    requested: true,
  });

  let usedCache = false;
  let result = await getDriverActionGps({
    timeoutMs,
    highAccuracy: true,
    maximumAge: DEFAULT_MAXIMUM_AGE_MS,
  });

  if (
    !result.ok &&
    allowCacheFallback &&
    lastGoodPoint &&
    Date.now() - lastGoodCapturedAt <= CACHE_FALLBACK_MS
  ) {
    usedCache = true;
    const cachedAt = lastGoodPoint.location_captured_at || lastGoodPoint.ts || new Date().toISOString();
    result = {
      ok: true,
      point: {
        ...lastGoodPoint,
        source: "cached",
        location_status: LOCATION_STATUS.CACHED,
        location_captured_at: cachedAt,
        ts: cachedAt,
      },
      location_status: LOCATION_STATUS.CACHED,
      usedCache: true,
    };
  }

  if (result.ok && result.point && !usedCache) {
    lastGoodPoint = result.point;
    lastGoodCapturedAt = Date.now();
  }

  gpsActionLog({
    eventType: eventType || null,
    callingFunction,
    requested: true,
    success: !!result.ok,
    lat: result.point?.lat ?? null,
    lng: result.point?.lng ?? result.point?.lon ?? null,
    accuracy: result.point?.accuracy ?? null,
    status: result.location_status || null,
    error: result.ok ? null : result.error || result.location_error || null,
    usedCache,
  });

  return result;
}

/** Última posición válida en memoria (< 5 min) como resultado GPS. */
export function tryRecentCacheAsGpsResult() {
  if (!lastGoodPoint || Date.now() - lastGoodCapturedAt > CACHE_FALLBACK_MS) return null;
  const cachedAt = lastGoodPoint.location_captured_at || lastGoodPoint.ts || new Date().toISOString();
  return {
    ok: true,
    point: {
      ...lastGoodPoint,
      source: "cached",
      location_status: LOCATION_STATUS.CACHED,
      location_captured_at: cachedAt,
      ts: cachedAt,
    },
    location_status: LOCATION_STATUS.CACHED,
    usedCache: true,
  };
}

/** Repone caché en memoria desde geo ya persistida (p. ej. inicio_servicio_geo). */
export function seedLocationCacheFromGeo(geo) {
  const lng = geo?.lng ?? geo?.lon;
  if (!geo || !Number.isFinite(Number(geo.lat)) || !Number.isFinite(Number(lng))) return false;
  const capturedAt = geo.location_captured_at || geo.ts || new Date().toISOString();
  lastGoodPoint = {
    lat: Number(geo.lat),
    lng: Number(lng),
    lon: Number(lng),
    accuracy: geo.accuracy_m != null ? Number(geo.accuracy_m) : geo.accuracy,
    ts: capturedAt,
    location_captured_at: capturedAt,
    location_status: geo.location_status || LOCATION_STATUS.CAPTURED,
    source: geo.source || "gps",
  };
  lastGoodCapturedAt = Date.parse(capturedAt) || Date.now();
  return true;
}

/** Intenta GPS sin modal (solo fallback interno). */
export async function tryDriverGeoSnapshot(opts = {}) {
  const gps = await getDriverActionGps({
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    highAccuracy: true,
    maximumAge: opts.maximumAge ?? DEFAULT_MAXIMUM_AGE_MS,
  });
  return gps.ok ? gps.point : null;
}

/** Convierte resultado GPS a payload geo para meta operativa. */
export function geoPayloadFromLocationResult(result) {
  if (result?.ok && result.point) {
    const p = result.point;
    const lng = p.lng ?? p.lon;
    const status =
      p.location_status === LOCATION_STATUS.CACHED
        ? LOCATION_STATUS.CACHED
        : LOCATION_STATUS.CAPTURED;
    return {
      lat: p.lat,
      lng,
      lon: lng,
      ts: p.ts || p.location_captured_at || new Date().toISOString(),
      location_captured_at: p.location_captured_at || p.ts || new Date().toISOString(),
      accuracy_m: p.accuracy != null ? Math.round(p.accuracy) : null,
      source: p.source || (status === LOCATION_STATUS.CACHED ? "cached" : "gps"),
      location_status: status,
      location_error: null,
    };
  }
  return {
    ts: new Date().toISOString(),
    location_captured_at: new Date().toISOString(),
    source: "no_disponible",
    location_status: result?.location_status || LOCATION_STATUS.UNAVAILABLE,
    location_error: result?.location_error || result?.error || null,
  };
}

/** Geo para persistir en evento: prefetch, caché reciente o inicio_servicio_geo del servicio. */
export function resolveEventGeoForPersist(prefetchedGps, eventType, opts = {}) {
  if (prefetchedGps?.ok && prefetchedGps.point) {
    const geo = geoPayloadFromLocationResult(prefetchedGps);
    gpsActionLog({
      eventType: eventType || null,
      stage: "persist_from_prefetch",
      success: true,
      lat: geo.lat ?? null,
      lng: geo.lng ?? null,
      accuracy: geo.accuracy_m ?? null,
      status: geo.location_status,
      usedCache: prefetchedGps.usedCache || geo.source === "cached",
    });
    return geo;
  }

  const cached = tryRecentCacheAsGpsResult();
  if (cached) {
    const geo = geoPayloadFromLocationResult(cached);
    gpsActionLog({
      eventType: eventType || null,
      stage: "persist_from_cache",
      success: true,
      lat: geo.lat ?? null,
      lng: geo.lng ?? null,
      accuracy: geo.accuracy_m ?? null,
      status: geo.location_status,
      usedCache: true,
    });
    return geo;
  }

  const servicioGeo = opts.servicioInicioGeo;
  const lng = servicioGeo?.lng ?? servicioGeo?.lon;
  if (servicioGeo && Number.isFinite(Number(servicioGeo.lat)) && Number.isFinite(Number(lng))) {
    const geo = {
      lat: Number(servicioGeo.lat),
      lng: Number(lng),
      lon: Number(lng),
      ts: servicioGeo.ts || servicioGeo.location_captured_at || new Date().toISOString(),
      location_captured_at:
        servicioGeo.location_captured_at || servicioGeo.ts || new Date().toISOString(),
      accuracy_m:
        servicioGeo.accuracy_m != null
          ? Math.round(Number(servicioGeo.accuracy_m))
          : null,
      source: "cached",
      location_status: LOCATION_STATUS.CACHED,
      location_error: null,
    };
    gpsActionLog({
      eventType: eventType || null,
      stage: "persist_from_inicio_servicio_geo",
      success: true,
      lat: geo.lat,
      lng: geo.lng,
      accuracy: geo.accuracy_m,
      status: geo.location_status,
      usedCache: true,
    });
    return geo;
  }

  const geo = geoPayloadFromLocationResult(
    prefetchedGps ?? { ok: false, location_status: LOCATION_STATUS.UNAVAILABLE },
  );
  gpsActionLog({
    eventType: eventType || null,
    stage: "persist_unavailable",
    success: false,
    lat: null,
    lng: null,
    accuracy: null,
    status: geo.location_status,
    error: geo.location_error,
    usedCache: false,
  });
  return geo;
}

/** @deprecated use resolveEventGeoForPersist */
export function eventGeoFromLocationResult(prefetchedGps) {
  return resolveEventGeoForPersist(prefetchedGps, null);
}
