export {
  DOMAIN_SCHEMA_VERSION,
  DOMAIN_SCHEMA_META_KEY,
} from "./constants/DomainSchemaVersion.js";

export {
  EXPEDIENTE_ESTADO,
  SERVICIO_ESTADO_PENDIENTE_ASIGNACION,
  SERVICIO_ESTADO_ASIGNADO,
  SERVICIO_ESTADO_EN_CURSO,
  SERVICIO_ESTADO_COMPLETADO,
  SERVICIO_ESTADO_CERRADO,
  SERVICIO_ESTADO_ANULADO,
  SERVICIO_ESTADO_CANCELADO,
  SERVICIO_ESTADOS_DB,
  isServicioEstadoValid,
} from "./constants/EstadosExpedicion.js";

export {
  DECA_VIVO_MOVIMIENTO,
  DECA_VIVO_MOVIMIENTO_LABELS,
  DECA_VIVO_SUMA_TIPOS,
  DECA_VIVO_RESTA_TIPOS,
} from "./constants/TiposMovimiento.js";

export * from "./types/expedicion.types.js";

export { toExpedicion, toOperacionMuelleActiva } from "./adapters/LegacyServicioAdapter.js";
export { toParada, toParadas } from "./adapters/LegacyStopAdapter.js";

export { ExpedicionRepository, expedicionRepository } from "./repositories/ExpedicionRepository.js";
export { InventarioRepository, inventarioRepository } from "./repositories/InventarioRepository.js";
export { MovimientoRepository, movimientoRepository } from "./repositories/MovimientoRepository.js";

export * from "./queries/index.js";

export { toMovimientoMercancia, toMovimientosMercancia } from "./adapters/LegacyMovimientoAdapter.js";
export {
  toInventarioActual,
  toInventarioVivo,
  toVersionesDecaHistorial,
  toEventosTimeline,
} from "./adapters/LegacyInventarioAdapter.js";
