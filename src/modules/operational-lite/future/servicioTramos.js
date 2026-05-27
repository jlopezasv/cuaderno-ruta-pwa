/**
 * Preparación multi-conductor (NO implementado en v1).
 *
 * v1: 1 servicio = 1 conductor (`servicios.conductor_id`).
 * Futuro:
 * - `service_assignments` / `servicio_tramos` con ownership por tramo
 * - timeline consolidado del servicio (operación global)
 * - expediente lite SIN tiempos tacográficos personales por conductor
 */
export const SERVICIO_TRAMOS_FUTURE = Object.freeze({
  version: 0,
  tables: {
    servicio_tramos: ["id", "servicio_id", "orden", "conductor_id", "desde_stop_id", "hasta_stop_id", "inicio_at", "fin_at"],
    service_assignments: ["id", "servicio_id", "conductor_id", "rol", "desde_at", "hasta_at"],
  },
  ownership: "conductor_id por tramo",
  expedienteScope: "servicio_global",
  timelineMode: "consolidado_por_parada",
  excludesFromLite: ["tacografo", "conduccion_personal", "descanso_legal", "computeTripOperationalMetrics"],
});
