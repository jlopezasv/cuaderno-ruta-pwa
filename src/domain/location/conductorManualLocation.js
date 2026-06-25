import { sbFetch } from "../../data/supabaseClient.js";
import { LOCATION_STATUS, requestActionLocation } from "../../data/driverActionGps.js";

const MANUAL_SOURCE = "actualizacion_manual";

async function fetchActiveServicioForUbicacion(uid) {
  const res = await sbFetch(
    `/rest/v1/servicios?conductor_id=eq.${encodeURIComponent(uid)}&estado=eq.en_curso&select=id,empresa_id,estado&order=fecha_inicio.desc&limit=1`,
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

async function fetchEmpresaIdForConductor(uid, servicio) {
  if (servicio?.empresa_id) return servicio.empresa_id;
  const res = await sbFetch(
    `/rest/v1/conductor_empresa?user_id=eq.${encodeURIComponent(uid)}&activo=eq.true&select=empresa_id&limit=1`,
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return rows[0]?.empresa_id || null;
}

async function upsertConductorUbicacionRow(row) {
  const res = await sbFetch("/rest/v1/ubicaciones?on_conflict=user_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
      "Content-Type": "application/json",
    },
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    let message = `Supabase ${res.status}`;
    try {
      const body = await res.json();
      message = body?.message || body?.error || message;
    } catch {
      try {
        message = (await res.text()) || message;
      } catch {
        /* ignore */
      }
    }
    throw new Error(message);
  }
  return true;
}

/**
 * Guarda una lectura GPS puntual solicitada por el conductor (sin tracking continuo).
 * @returns {Promise<{ ok: true } | { ok: false, code: string, error?: string }>}
 */
export async function saveManualConductorLocation(uid) {
  if (!uid) {
    return { ok: false, code: "no_session", error: "Sin sesión" };
  }

  const gps = await requestActionLocation(MANUAL_SOURCE, {
    callingFunction: "saveManualConductorLocation",
    timeoutMs: 12000,
  });

  if (!gps.ok) {
    const denied =
      gps.location_status === LOCATION_STATUS.DENIED ||
      gps.location_status === LOCATION_STATUS.TIMEOUT ||
      gps.location_status === LOCATION_STATUS.UNAVAILABLE;
    return {
      ok: false,
      code: denied ? "gps_permission" : "gps_error",
      error: gps.error || gps.location_error || "GPS no disponible",
    };
  }

  const point = gps.point;
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon ?? point.lng)) {
    return { ok: false, code: "gps_error", error: "Coordenadas inválidas" };
  }

  const lon = point.lon ?? point.lng;
  const servicio = await fetchActiveServicioForUbicacion(uid);
  const empresaId = await fetchEmpresaIdForConductor(uid, servicio);

  try {
    await upsertConductorUbicacionRow({
      user_id: uid,
      lat: point.lat,
      lon,
      ts: point.ts || new Date().toISOString(),
      precision_m: Math.round(point.accuracy || 0),
      velocidad: point.speed != null ? Math.round(point.speed * 3.6) : null,
      empresa_id: empresaId,
      servicio_id: servicio?.id || null,
      event_type: MANUAL_SOURCE,
      source: MANUAL_SOURCE,
      stop_id: null,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, code: "save_error", error: e?.message || "Error al guardar" };
  }
}
