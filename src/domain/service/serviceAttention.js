/**
 * Señales mínimas para priorizar servicios que pueden requerir seguimiento operativo.
 * Sin heurísticas complejas; solo datos ya presentes en cliente.
 */

/** Inactividad relativa considerada “demasiado antigua” (conservador: 48 h). */
export const ATTENTION_IDLE_MS = 48 * 60 * 60 * 1000;

function hasIncidencia(evidencias, stops) {
  if (Array.isArray(evidencias)) {
    return evidencias.some((ev) => ev?.tipo === "incidencia");
  }
  if (evidencias && typeof evidencias === "object") {
    for (const st of stops || []) {
      const arr = evidencias[st.id];
      if (Array.isArray(arr) && arr.some((ev) => ev?.tipo === "incidencia")) return true;
    }
    for (const arr of Object.values(evidencias)) {
      if (Array.isArray(arr) && arr.some((ev) => ev?.tipo === "incidencia")) return true;
    }
  }
  return false;
}

function isStale(service, lastActivity) {
  const ts = lastActivity?.ts;
  if (ts == null || !Number.isFinite(ts)) return false;
  if (service?.estado === "completado") return false;
  return Date.now() - ts > ATTENTION_IDLE_MS;
}

export function needsAttention({ service, stops, evidencias, lastActivity }) {
  const st = stops || [];

  if (hasIncidencia(evidencias, st)) return true;
  if (service?.estado === "asignado") return true;

  if (isStale(service, lastActivity)) return true;

  return false;
}

export function getAttentionReason({ service, stops, evidencias, lastActivity }) {
  const st = stops || [];

  if (hasIncidencia(evidencias, st)) return "Incidencia registrada";
  if (service?.estado === "asignado") return "Servicio sin iniciar";

  if (isStale(service, lastActivity)) return "Sin actividad reciente";

  return "";
}
