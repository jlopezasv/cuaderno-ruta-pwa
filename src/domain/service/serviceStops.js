import { SERVICIO_ESTADOS_ACTIVOS } from "../fleet/serviceStatus";

export function isServiceActive(service) {
  return SERVICIO_ESTADOS_ACTIVOS.includes(service?.estado);
}

export function isStopOperationallyComplete(stop) {
  return !!stop?.hora_salida_real || stop?.estado === "completado";
}

export function areAllStopsComplete(stops) {
  const sorted = [...(stops || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  if (!sorted.length) return false;
  return sorted.every(isStopOperationallyComplete);
}

export function getCurrentStop(stops) {
  const sorted = [...(stops || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const incomplete = sorted.filter((s) => !isStopOperationallyComplete(s));
  const inMuelle = incomplete.find((s) => s.estado === "llegado");
  if (inMuelle) return inMuelle;
  return incomplete[0] || null;
}

/** Parada anterior en `orden` que sigue pendiente (para aviso no bloqueante al saltar orden). */
export function findEarlierPendingStopInRoute(stops, targetStop) {
  if (!targetStop?.id) return null;
  const targetOrden = Number(targetStop.orden) || 0;
  const sorted = [...(stops || [])].sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
  for (const stop of sorted) {
    if ((Number(stop.orden) || 0) >= targetOrden) break;
    if (!isStopOperationallyComplete(stop)) return stop;
  }
  return null;
}

/** Solo la parada operativa actual debe quedar expandida; null = todas plegadas. */
export function resolveExpandedStopId(stops, servicio) {
  const sorted = [...(stops || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const estado = String(servicio?.estado || "").toLowerCase();
  if (estado === "completado" || estado === "cerrado") return null;
  if (areAllStopsComplete(sorted)) return null;
  return getCurrentStop(sorted)?.id ?? null;
}

export function countCompletedStops(stops) {
  return stops.filter((s) => s.estado === "completado").length;
}
