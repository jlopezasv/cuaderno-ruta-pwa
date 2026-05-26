import {
  SERVICIO_ESTADO_ASIGNADO,
  SERVICIO_ESTADO_COMPLETADO,
  SERVICIO_ESTADO_EN_CURSO,
  SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
} from "../fleet/serviceStatus.js";

/** Prioridad para elegir el servicio operativo actual del conductor. */
export function estadoRankForDriverQueue(estado) {
  const st = String(estado || "").toLowerCase();
  if (st === SERVICIO_ESTADO_EN_CURSO) return 0;
  if (st === SERVICIO_ESTADO_ASIGNADO) return 1;
  if (st === SERVICIO_ESTADO_COMPLETADO) return 2;
  if (st === SERVICIO_ESTADO_PENDIENTE_ASIGNACION) return 3;
  return 9;
}

/** Orden de candidatos operativos (misma lógica que tab Servicio). */
export function sortDriverOperationalCandidates(candidates) {
  return [...(Array.isArray(candidates) ? candidates : [])].sort((a, b) => {
    const ra = estadoRankForDriverQueue(a?.estado);
    const rb = estadoRankForDriverQueue(b?.estado);
    if (ra !== rb) return ra - rb;
    return new Date(b?.created_at || 0) - new Date(a?.created_at || 0);
  });
}

/**
 * Siguiente servicio en cola: solo asignado / pendiente con conductor, por fecha prevista.
 * @param {object[]} candidates — ya filtrados operativos
 * @param {string|null} currentServicioId
 */
export function pickNextAssignedService(candidates, currentServicioId) {
  const pool = (Array.isArray(candidates) ? candidates : []).filter((sv) => {
    if (!sv?.id || sv.id === currentServicioId) return false;
    const st = String(sv.estado || "").toLowerCase();
    return st === SERVICIO_ESTADO_ASIGNADO || st === SERVICIO_ESTADO_PENDIENTE_ASIGNACION;
  });
  if (!pool.length) return null;
  pool.sort((a, b) => {
    const ta = a?.fecha_inicio ? new Date(a.fecha_inicio).getTime() : NaN;
    const tb = b?.fecha_inicio ? new Date(b.fecha_inicio).getTime() : NaN;
    const fa = Number.isFinite(ta) ? ta : Number.POSITIVE_INFINITY;
    const fb = Number.isFinite(tb) ? tb : Number.POSITIVE_INFINITY;
    if (fa !== fb) return fa - fb;
    return new Date(a?.created_at || 0) - new Date(b?.created_at || 0);
  });
  return pool[0];
}
