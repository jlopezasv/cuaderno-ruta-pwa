import { SERVICIO_ESTADOS_ACTIVOS } from "../fleet/serviceStatus";

export function isServiceActive(service) {
  return SERVICIO_ESTADOS_ACTIVOS.includes(service?.estado);
}

export function getCurrentStop(stops) {
  return stops.find((s) => s.estado === "llegado") || stops.find((s) => s.estado === "pendiente");
}

export function countCompletedStops(stops) {
  return stops.filter((s) => s.estado === "completado").length;
}
