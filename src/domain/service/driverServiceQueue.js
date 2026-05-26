import {
  SERVICIO_ESTADO_ASIGNADO,
  SERVICIO_ESTADO_COMPLETADO,
  SERVICIO_ESTADO_EN_CURSO,
  SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
} from "../fleet/serviceStatus.js";
import { needsExpedienteClosure } from "./expedienteCierre.js";

/**
 * Prioridad del servicio principal del conductor.
 * `completado` (firma pendiente) va antes que `asignado` para no promover el siguiente
 * mientras el expediente no esté cerrado.
 */
export function estadoRankForDriverQueue(estado) {
  const st = String(estado || "").toLowerCase();
  if (st === SERVICIO_ESTADO_EN_CURSO) return 0;
  if (st === SERVICIO_ESTADO_COMPLETADO) return 1;
  if (st === SERVICIO_ESTADO_ASIGNADO) return 2;
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

/**
 * Aplica resolución remota sin desincronizar servicio/paradas ni saltar el cierre documental.
 * @param {{ servicio: object|null, stops: object[], siguienteServicio: object|null, siguientesStops: object[] }} previous
 * @param {{ servicio: object|null, stops: object[], siguienteServicio?: object|null, siguientesStops?: object[] }} resolved
 */
export function mergeDriverActiveViewFromResolution(previous, resolved) {
  const prev = previous && typeof previous === "object" ? previous : {};
  const prevSvc = prev.servicio ?? null;
  const prevStops = Array.isArray(prev.stops) ? prev.stops : [];
  const nextSvc = resolved?.servicio ?? null;
  const nextStops = Array.isArray(resolved?.stops) ? resolved.stops : [];
  const siguienteServicio =
    resolved?.siguienteServicio !== undefined ? resolved.siguienteServicio : (prev.siguienteServicio ?? null);
  const siguientesStops =
    resolved?.siguientesStops !== undefined
      ? Array.isArray(resolved.siguientesStops)
        ? resolved.siguientesStops
        : []
      : Array.isArray(prev.siguientesStops)
        ? prev.siguientesStops
        : [];

  const pinClosure =
    prevSvc?.id &&
    nextSvc?.id &&
    prevSvc.id !== nextSvc.id &&
    needsExpedienteClosure(prevSvc, prevStops);

  if (pinClosure) {
    return {
      servicio: prevSvc,
      stops: prevStops,
      siguienteServicio,
      siguientesStops,
    };
  }

  if (!nextSvc?.id) {
    return {
      servicio: null,
      stops: [],
      siguienteServicio: null,
      siguientesStops: [],
    };
  }

  const sameService = prevSvc?.id === nextSvc.id;
  if (
    sameService &&
    String(prevSvc?.estado || "") === SERVICIO_ESTADO_COMPLETADO &&
    needsExpedienteClosure(prevSvc, prevStops) &&
    String(nextSvc?.estado || "") !== SERVICIO_ESTADO_COMPLETADO &&
    String(nextSvc?.estado || "") !== "cerrado"
  ) {
    return {
      servicio: { ...nextSvc, estado: SERVICIO_ESTADO_COMPLETADO },
      stops: nextStops.length ? nextStops : prevStops,
      siguienteServicio,
      siguientesStops,
    };
  }

  return {
    servicio: nextSvc,
    stops: nextStops,
    siguienteServicio,
    siguientesStops,
  };
}
