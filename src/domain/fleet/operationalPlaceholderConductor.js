/**
 * Servicios sin chófer asignado: sin `conductor_id` o solo planificados (`pendiente_asignacion`).
 * Si ya hay `conductor_id`, la UI operativa (timeline, GPS, expediente) debe activarse aunque el estado local vaya rezagado.
 */
export function servicioSinConductorOperacional(servicio) {
  if (!servicio) return true;
  if (servicio.conductor_id) return false;
  if (servicio.estado === "pendiente_asignacion") return true;
  return true;
}

/** `conductor_id` real para tracking / ubicaciones. */
export function conductorUidOperativoServicio(servicio) {
  if (!servicio?.conductor_id) return null;
  return servicio.conductor_id;
}
