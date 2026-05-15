/** GPS para acciones del conductor (muelle, evidencias, etc.). */

function gpsActionErrorMessage(error) {
  if (error?.code === 1) return "Permiso de ubicación denegado";
  if (error?.code === 2) return "Ubicación no disponible";
  if (error?.code === 3) return "Tiempo de espera GPS agotado";
  return error?.message || "No se pudo obtener ubicación";
}

/**
 * @param {{ fresh?: boolean, timeoutMs?: number }} [opts]
 */
export function getDriverActionGps(opts = {}) {
  const fresh = !!opts.fresh;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? Math.min(60000, Math.max(3000, opts.timeoutMs)) : 12000;
  const maximumAge = fresh ? 0 : 60000;
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ ok: false, error: "GPS no disponible en este dispositivo" });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          resolve({ ok: false, error: "Coordenadas GPS inválidas" });
          return;
        }
        resolve({
          ok: true,
          point: { lat, lon, accuracy, speed, ts: new Date().toISOString() },
        });
      },
      (error) => resolve({ ok: false, error: gpsActionErrorMessage(error) }),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge },
    );
  });
}

/** Intenta GPS sin bloquear la acción principal. */
export async function tryDriverGeoSnapshot(opts = {}) {
  const gps = await getDriverActionGps({ fresh: true, timeoutMs: opts.timeoutMs ?? 10000 });
  return gps.ok ? gps.point : null;
}
