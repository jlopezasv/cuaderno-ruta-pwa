/**
 * Estados de expedición (meta `expediente_estado`) y servicio (`servicios.estado`).
 * Literales alineados con `operacionMuelleModel.js` y `serviceStatus.js`.
 */

/** Ciclo de vida documental del expediente (meta en referencia). */
export const EXPEDIENTE_ESTADO = Object.freeze({
  BORRADOR: "borrador",
  ACTIVO: "activo",
  EN_MUELLE: "en_muelle",
  EN_RUTA: "en_ruta",
  FINALIZADO: "finalizado",
  ANULADO: "anulado",
});

export {
  SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
  SERVICIO_ESTADO_ASIGNADO,
  SERVICIO_ESTADO_EN_CURSO,
  SERVICIO_ESTADO_COMPLETADO,
  SERVICIO_ESTADO_CERRADO,
  SERVICIO_ESTADO_ANULADO,
  SERVICIO_ESTADO_CANCELADO,
  SERVICIO_ESTADOS_DB,
  isServicioEstadoValid,
} from "../../fleet/serviceStatus.js";
