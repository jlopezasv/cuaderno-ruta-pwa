import { SERVICIO_ESTADOS_ACTIVOS } from "../fleet/serviceStatus";

export function isServiceActive(service) {
  return SERVICIO_ESTADOS_ACTIVOS.includes(service?.estado);
}

export function getCurrentStop(stops) {
  const sorted = [...(stops || [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const incomplete = sorted.filter((s) => !s?.hora_salida_real && s?.estado !== "completado");
  const inMuelle = incomplete.find((s) => s.estado === "llegado");
  if (inMuelle) return inMuelle;
  return incomplete[0] || null;
}

export function countCompletedStops(stops) {
  return stops.filter((s) => s.estado === "completado").length;
}
