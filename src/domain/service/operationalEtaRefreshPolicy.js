import { haverDist } from "../route/routePlanning.js";

/** Mínimo entre recálculos completos (routing) salvo eventos forzados. */
export const OPERATIONAL_ETA_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/** Desplazamiento mínimo desde el punto del último cálculo para forzar recálculo. */
export const OPERATIONAL_ETA_MOVE_KM = 15;

/** Si la ETA almacenada quedó muy atrás en el tiempo, se considera desviación fuerte. */
export const OPERATIONAL_ETA_OVERDUE_MS = 45 * 60 * 1000;

/** Eventos operativos: siempre recalculan (cambio de fase / parada relevante). */
export const OPERATIONAL_ETA_FORCE_EVENT_TYPES = Object.freeze(
  new Set(["inicio_servicio", "entrada_muelle", "salida_muelle", "inicio_operacion_stop"]),
);

/**
 * Decide si conviene volver a llamar a routing y persistir `operational_eta`.
 * No sustituye validaciones de negocio en `persistServiceOperationalEta`.
 *
 * @param {object} p
 * @param {number} [p.nowMs]
 * @param {object|null} p.prev — snapshot previo (`operational_eta`)
 * @param {{ lat: number, lon: number }} p.point
 * @param {string|number} p.servicioId
 * @param {string|null|undefined} p.activeStopId — parada activa (`getCurrentStop`)
 * @param {string|null|undefined} p.eventType
 * @param {boolean} [p.force] — p.e. refresco explícito empresa
 * @returns {{ should: boolean, reason: string }}
 */
export function shouldPersistOperationalEtaRefresh({
  nowMs = Date.now(),
  prev,
  point,
  servicioId,
  activeStopId,
  eventType,
  force,
}) {
  if (force) return { should: true, reason: "force" };
  if (!prev || typeof prev !== "object" || !prev.eta) return { should: true, reason: "no_prev_snapshot" };

  const ev = eventType ? String(eventType) : "";
  if (ev && OPERATIONAL_ETA_FORCE_EVENT_TYPES.has(ev)) return { should: true, reason: `event:${ev}` };

  const calcRaw = prev.last_eta_refresh_at || prev.calculated_at || prev.updated_at;
  const calcMs = calcRaw ? new Date(calcRaw).getTime() : NaN;
  if (Number.isFinite(calcMs) && nowMs - calcMs >= OPERATIONAL_ETA_REFRESH_INTERVAL_MS) {
    return { should: true, reason: "interval_15m" };
  }

  const plat = Number(prev.lat);
  const plon = Number(prev.lon);
  if (
    point &&
    Number.isFinite(plat) &&
    Number.isFinite(plon) &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon)
  ) {
    const movedKm = haverDist(plat, plon, point.lat, point.lon);
    if (Number.isFinite(movedKm) && movedKm >= OPERATIONAL_ETA_MOVE_KM) {
      return { should: true, reason: "moved_15km" };
    }
  }

  const prevSid = prev.servicio_id != null ? String(prev.servicio_id) : null;
  if (prevSid && servicioId != null && prevSid !== String(servicioId)) {
    return { should: true, reason: "servicio_change" };
  }

  const etaMs = new Date(prev.eta).getTime();
  if (Number.isFinite(etaMs) && nowMs - etaMs > OPERATIONAL_ETA_OVERDUE_MS) {
    return { should: true, reason: "eta_overdue_45m" };
  }

  const pStop = prev.active_stop_id != null ? String(prev.active_stop_id) : null;
  const nStop = activeStopId != null ? String(activeStopId) : null;
  if (pStop != null && nStop != null && pStop !== nStop) {
    return { should: true, reason: "active_stop_change" };
  }

  return { should: false, reason: "throttled" };
}
