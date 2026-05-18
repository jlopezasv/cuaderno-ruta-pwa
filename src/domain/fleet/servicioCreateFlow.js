import {
  assignConductorPrincipalToServicio,
  SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
} from "./servicioAssignment.js";

/**
 * Asignación canónica tras crear servicio planificado (sin conductor en BD).
 * Único camino válido para bootstrap + PATCH conductor.
 */
export async function asignarConductorEnServicioCreado({
  servicioId,
  servicio,
  conductorId,
  conductorNombre = null,
  origen = null,
  destino = null,
  fechaInicio = null,
}) {
  if (!servicioId || !conductorId) {
    throw new Error("Servicio o conductor no válido");
  }
  const base = servicio && typeof servicio === "object" ? servicio : { id: servicioId };
  return assignConductorPrincipalToServicio({
    servicioId,
    servicio: {
      ...base,
      id: servicioId,
      conductor_id: null,
      estado: SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
    },
    conductorId,
    conductorNombre,
    origen: origen ?? base.origen,
    destino: destino ?? base.destino,
    fechaInicio: fechaInicio ?? base.fecha_inicio,
  });
}

/** Fila servicio tras asignación (optimistic UI / flota). */
export function mergeServicioTrasAsignacion(servicio, assignResult, conductorId) {
  if (!servicio?.id || !assignResult) return servicio;
  return {
    ...servicio,
    conductor_id: conductorId,
    estado: "asignado",
    referencia: assignResult.referencia ?? servicio.referencia,
  };
}
