/** GPS para acciones del conductor (muelle, evidencias, etc.). */

import { isDemoApp } from "../config/appEnvironment.js";

export const LOCATION_STATUS = Object.freeze({
  OK: "ok",
  DENIED: "denied",
  UNAVAILABLE: "unavailable",
  TIMEOUT: "timeout",
  UNSUPPORTED: "unsupported",
});

function gpsDemoLog(msg, extra) {
  if (!isDemoApp()) return;
  if (extra !== undefined) console.log(`[GPS acción] ${msg}`, extra);
  else console.log(`[GPS acción] ${msg}`);
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

/**
 * @param {{ fresh?: boolean, timeoutMs?: number, highAccuracy?: boolean }} [opts]
 */
export function getDriverActionGps(opts = {}) {
  const fresh = !!opts.fresh;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? Math.min(60000, Math.max(3000, opts.timeoutMs)) : 14000;
  const maximumAge = fresh ? 0 : 60000;
  const enableHighAccuracy = opts.highAccuracy ?? isMobileLike();

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({
      ok: false,
      error: "GPS no disponible en este dispositivo",
      location_status: LOCATION_STATUS.UNSUPPORTED,
    });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          resolve({
            ok: false,
            error: "Coordenadas GPS inválidas",
            location_status: LOCATION_STATUS.UNAVAILABLE,
          });
          return;
        }
        resolve({
          ok: true,
          point: {
            lat,
            lon,
            accuracy,
            speed,
            ts: new Date().toISOString(),
            location_captured_at: new Date().toISOString(),
            location_status: LOCATION_STATUS.OK,
          },
          location_status: LOCATION_STATUS.OK,
        });
      },
      (error) => {
        const status = locationStatusFromError(error);
        resolve({
          ok: false,
          error: gpsActionErrorMessage(error),
          location_status: status,
          location_error: gpsActionErrorMessage(error),
        });
      },
      { enableHighAccuracy, timeout: timeoutMs, maximumAge },
    );
  });
}

/**
 * Solicita ubicación para una acción operativa (llamar desde gesto del usuario).
 * @returns {Promise<{ok:boolean, point?:object, location_status:string, location_error?:string, error?:string}>}
 */
export async function requestActionLocation(opts = {}) {
  gpsDemoLog("solicitando ubicación");
  const gps = await getDriverActionGps({ fresh: true, timeoutMs: opts.timeoutMs ?? 14000, highAccuracy: opts.highAccuracy });

  if (gps.ok) {
    gpsDemoLog("permiso concedido", { lat: gps.point?.lat, lon: gps.point?.lon, accuracy: gps.point?.accuracy });
    return gps;
  }

  const status = gps.location_status || LOCATION_STATUS.UNAVAILABLE;
  if (status === LOCATION_STATUS.DENIED) gpsDemoLog("permiso denegado", { error: gps.error });
  else if (status === LOCATION_STATUS.TIMEOUT) gpsDemoLog("timeout", { error: gps.error });
  else gpsDemoLog("evento guardado sin ubicación", { status, error: gps.error });

  return gps;
}

/** Intenta GPS sin bloquear la acción principal. */
export async function tryDriverGeoSnapshot(opts = {}) {
  const gps = await getDriverActionGps({ fresh: true, timeoutMs: opts.timeoutMs ?? 10000 });
  return gps.ok ? gps.point : null;
}

/** Convierte resultado GPS a payload geo para meta operativa. */
export function geoPayloadFromLocationResult(result) {
  if (result?.ok && result.point) {
    return {
      lat: result.point.lat,
      lon: result.point.lon,
      ts: result.point.ts || result.point.location_captured_at || new Date().toISOString(),
      location_captured_at: result.point.location_captured_at || result.point.ts || new Date().toISOString(),
      accuracy_m: result.point.accuracy != null ? Math.round(result.point.accuracy) : null,
      source: "gps",
      location_status: LOCATION_STATUS.OK,
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
