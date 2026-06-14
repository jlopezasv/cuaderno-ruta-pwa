/** GPS para acciones del conductor (muelle, evidencias, etc.). */

import { isDemoApp } from "../config/appEnvironment.js";

export const LOCATION_STATUS = Object.freeze({
  OK: "ok",
  DENIED: "denied",
  UNAVAILABLE: "unavailable",
  TIMEOUT: "timeout",
  UNSUPPORTED: "unsupported",
});

const RECENT_FALLBACK_MS = 120000;
const DEFAULT_TIMEOUT_MS = 10000;

let lastGoodPoint = null;
let lastGoodCapturedAt = 0;

function gpsEventLog(payload) {
  if (!isDemoApp()) return;
  console.log("[GPS evento]", payload);
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

function isMobileLike() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

function normalizePoint(pos, { fallback = false } = {}) {
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
    location_status: LOCATION_STATUS.OK,
    location_error: null,
    source: fallback ? "gps_fallback" : "gps",
  };
}

/**
 * @param {{ fresh?: boolean, timeoutMs?: number, highAccuracy?: boolean }} [opts]
 */
export function getDriverActionGps(opts = {}) {
  const fresh = !!opts.fresh;
  const timeoutMs = Number.isFinite(opts.timeoutMs)
    ? Math.min(60000, Math.max(3000, opts.timeoutMs))
    : DEFAULT_TIMEOUT_MS;
  const maximumAge = fresh ? 0 : 60000;
  const enableHighAccuracy = opts.highAccuracy ?? isMobileLike();

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
          location_status: LOCATION_STATUS.OK,
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
 * Solicita ubicación para un evento operativo (mismo flujo que inicio de servicio).
 * @param {string} eventType
 * @param {{ callingFunction?: string, timeoutMs?: number, highAccuracy?: boolean, allowRecentFallback?: boolean }} [opts]
 */
export async function requestActionLocation(eventType, opts = {}) {
  const callingFunction = opts.callingFunction || "requestActionLocation";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allowRecentFallback = opts.allowRecentFallback !== false;

  gpsEventLog({
    eventType: eventType || null,
    callingFunction,
    requested: true,
  });

  let result = await getDriverActionGps({
    fresh: true,
    timeoutMs,
    highAccuracy: opts.highAccuracy,
  });

  if (
    !result.ok &&
    result.location_status !== LOCATION_STATUS.DENIED &&
    result.location_status !== LOCATION_STATUS.UNSUPPORTED
  ) {
    const retry = await getDriverActionGps({
      fresh: true,
      timeoutMs: Math.min(8000, timeoutMs),
      highAccuracy: false,
    });
    if (retry.ok) {
      result = { ...retry, usedLowAccuracyRetry: true };
    }
  }

  if (
    !result.ok &&
    allowRecentFallback &&
    lastGoodPoint &&
    Date.now() - lastGoodCapturedAt <= RECENT_FALLBACK_MS
  ) {
    result = {
      ok: true,
      point: { ...lastGoodPoint, source: "gps_fallback" },
      location_status: LOCATION_STATUS.OK,
      usedFallback: true,
    };
    gpsEventLog({
      eventType: eventType || null,
      callingFunction,
      requested: true,
      success: true,
      fallback: true,
      lat: lastGoodPoint.lat,
      lng: lastGoodPoint.lng ?? lastGoodPoint.lon,
      accuracy: lastGoodPoint.accuracy,
    });
  }

  if (result.ok && result.point) {
    lastGoodPoint = result.point;
    lastGoodCapturedAt = Date.now();
  }

  gpsEventLog({
    eventType: eventType || null,
    callingFunction,
    requested: true,
    success: !!result.ok,
    lat: result.point?.lat ?? null,
    lng: result.point?.lng ?? result.point?.lon ?? null,
    accuracy: result.point?.accuracy ?? null,
    error: result.ok ? null : result.error || result.location_error || null,
    location_status: result.location_status || null,
  });

  return result;
}

/** Intenta GPS sin bloquear la acción principal. */
export async function tryDriverGeoSnapshot(opts = {}) {
  const gps = await getDriverActionGps({ fresh: true, timeoutMs: opts.timeoutMs ?? 10000 });
  return gps.ok ? gps.point : null;
}

/** Convierte resultado GPS a payload geo para meta operativa. */
export function geoPayloadFromLocationResult(result) {
  if (result?.ok && result.point) {
    const p = result.point;
    const lng = p.lng ?? p.lon;
    return {
      lat: p.lat,
      lng,
      lon: lng,
      ts: p.ts || p.location_captured_at || new Date().toISOString(),
      location_captured_at: p.location_captured_at || p.ts || new Date().toISOString(),
      accuracy_m: p.accuracy != null ? Math.round(p.accuracy) : null,
      source: p.source || "gps",
      location_status: LOCATION_STATUS.OK,
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

/** Geo para persistir en evento: usa resultado GPS prefetch si existe. */
export function eventGeoFromLocationResult(prefetchedGps) {
  if (prefetchedGps == null) {
    return geoPayloadFromLocationResult({ ok: false, location_status: LOCATION_STATUS.UNAVAILABLE });
  }
  return geoPayloadFromLocationResult(prefetchedGps);
}
