/**
 * Señales mínimas para priorizar servicios que pueden requerir seguimiento operativo.
 * Sin heurísticas complejas; solo datos ya presentes en cliente.
 */

/** Inactividad relativa considerada “demasiado antigua” (conservador: 48 h). */
export const ATTENTION_IDLE_MS = 48 * 60 * 60 * 1000;

function hasIncidencia(service, stops) {
  if (Number.isFinite(Number(service?.incidencias_total)) && Number(service.incidencias_total) > 0) {
    return true;
  }
  if (Number.isFinite(Number(stops?.incidenciasTotal)) && Number(stops.incidenciasTotal) > 0) {
    return true;
  }
  return false;
}

function isStale(service, lastActivity) {
  const ts = lastActivity?.ts;
  if (ts == null || !Number.isFinite(ts)) return false;
  if (service?.estado === "completado" || service?.estado === "cerrado") return false;
  return Date.now() - ts > ATTENTION_IDLE_MS;
}

export function needsAttention({ service, stops, evidencias, lastActivity }) {
  const st = stops || [];

  if (hasIncidencia(service, st)) return true;
  if (service?.estado === "pendiente_asignacion") return true;
  if (service?.estado === "asignado") return true;

  if (isStale(service, lastActivity)) return true;

  return false;
}

export function getAttentionReason({ service, stops, evidencias, lastActivity }) {
  const st = stops || [];

  if (hasIncidencia(service, st)) return "Incidencia registrada";
  if (service?.estado === "pendiente_asignacion") return "Sin conductor asignado";
  if (service?.estado === "asignado") return "Servicio sin iniciar";

  if (isStale(service, lastActivity)) return "Sin actividad reciente";

  return "";
}
