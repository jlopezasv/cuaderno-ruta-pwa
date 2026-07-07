/**
 * @typedef {import('./constants/EstadosExpedicion.js').EXPEDIENTE_ESTADO} ExpedienteEstadoLiteral
 */

/**
 * Expedición — agregado raíz del dominio logístico.
 * Alias técnico legacy: fila `servicios` + meta `__SRV_OP__`.
 *
 * @typedef {Object} Expedicion
 * @property {string} id
 * @property {string} referenciaVisible Texto humano de `referencia` sin meta JSON.
 * @property {string} estadoServicio Valor `servicios.estado` (CHECK DB).
 * @property {string} estadoExpedicion Meta `expediente_estado`.
 * @property {string} tipoTransporte nacional | internacional | mixto | sin_definir
 * @property {boolean} esAutonomoExpediente Meta `autonomo_expediente_v1`.
 * @property {number|null} domainSchemaVersion Meta `domain_schema_version`.
 * @property {string|null} startedAt
 * @property {string|null} conductorId
 * @property {string|null} empresaId
 */

/**
 * Parada de ruta — alias técnico legacy: fila `stops` + meta `__CUADERNO_OP__`.
 *
 * @typedef {Object} Parada
 * @property {string} id
 * @property {string} servicioId
 * @property {string} tipo
 * @property {string} nombre
 * @property {number|null} orden
 * @property {string} notasVisible Texto humano de `notas` sin meta JSON.
 * @property {Record<string, unknown>} meta Payload operativo parseado.
 */

/**
 * Movimiento de mercancía en inventario DeCA vivo.
 *
 * @typedef {Object} MovimientoMercancia
 * @property {string} id
 * @property {string} servicioId
 * @property {string} tipoMovimiento Valor DECA_VIVO_MOVIMIENTO.
 * @property {string} descripcionMercancia
 * @property {number|null} cantidad
 * @property {string|null} unidad
 * @property {number|null} pesoKg
 * @property {string|null} fechaHora ISO
 */

/**
 * Operación de muelle activa (sesión en meta expedición).
 *
 * @typedef {Object} OperacionMuelle
 * @property {string} id
 * @property {string} estado abierta | cerrada | anulada
 * @property {string|null} entradaAt
 * @property {string|null} muelleNombre
 * @property {string|null} tipoPrevisto
 * @property {Array<Record<string, unknown>>} movimientos
 */

export {};
