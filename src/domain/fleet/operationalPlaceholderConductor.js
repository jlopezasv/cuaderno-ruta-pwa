/**
 * Servicios sin chófer asignado: `conductor_id` NULL y/o estado `pendiente_asignacion`.
 * La UI de empresa evita tracking en vivo (GPS, ETA conductor) hasta que haya conductor real.
 */
export function servicioSinConductorOperacional(servicio) {
  if (!servicio) return true;
  if (servicio.estado === "pendiente_asignacion") return true;
  return !servicio.conductor_id;
}

/** `conductor_id` real para tracking / ubicaciones; excluye pendiente sin conductor. */
export function conductorUidOperativoServicio(servicio) {
  if (!servicio?.conductor_id) return null;
  if (servicio.estado === "pendiente_asignacion") return null;
  return servicio.conductor_id;
}
