/**
 * @file Tipos JSDoc del módulo DeCA vivo (Documento de Control Administrativo dinámico).
 * Ref. normativa: Orden FOM/2861/2012, Orden TRM/282/2026, BOE-A-2026-12784.
 */

/**
 * @typedef {'CARGA'|'DESCARGA'|'CARGA_RETORNO'|'DESCARGA_RETORNO'|'DEVOLUCION'|'RECOGIDA_ENVASES'|'ENTREGA_ENVASES'|'AJUSTE_MANUAL'|'INCIDENCIA_MERCANCIA'} DecaVivoTipoMovimiento
 */

/**
 * @typedef {'borrador'|'actual'|'cerrado'|'anulado'} DecaDocumentoEstado
 */

/**
 * @typedef {object} DecaDocumento
 * @property {string} id
 * @property {string} servicio_id
 * @property {string|null} empresa_id
 * @property {string|null} conductor_id
 * @property {string|null} matricula_tractora
 * @property {string|null} matricula_remolque
 * @property {string|null} cargador_contractual_nombre
 * @property {string|null} cargador_contractual_nif
 * @property {string|null} transportista_efectivo_nombre
 * @property {string|null} transportista_efectivo_nif
 * @property {DecaDocumentoEstado} estado
 * @property {number} version
 * @property {boolean} es_visible_conductor
 * @property {string} qr_token
 * @property {string|null} pdf_url
 * @property {object} snapshot_json
 * @property {string} fecha_actualizacion
 */

/**
 * @typedef {object} DecaMovimientoCarga
 * @property {string} id
 * @property {string} servicio_id
 * @property {string|null} deca_id
 * @property {DecaVivoTipoMovimiento} tipo_movimiento
 * @property {string} descripcion_mercancia
 * @property {string|null} categoria_mercancia
 * @property {number|null} cantidad
 * @property {string|null} unidad
 * @property {number|null} peso_kg
 * @property {string|null} origen_nombre
 * @property {string|null} destino_nombre
 * @property {string|null} lugar_nombre
 * @property {string|null} parada_id
 * @property {string|null} motivo_ajuste
 * @property {string} fecha_hora
 * @property {string} created_at
 */

/**
 * @typedef {object} DecaStockLinea
 * @property {string} line_key
 * @property {string} descripcion_mercancia
 * @property {string|null} categoria_mercancia
 * @property {number} cantidad_actual
 * @property {string|null} unidad
 * @property {number|null} peso_kg_actual
 * @property {string|null} origen_trazable
 * @property {string|null} destino_previsto
 */

/**
 * @typedef {object} DecaVivoVisiblePayload
 * @property {string} servicio_id
 * @property {DecaDocumento|null} documento
 * @property {DecaStockLinea[]} stock_actual
 * @property {DecaMovimientoCarga[]} ultimos_movimientos
 */

/**
 * @typedef {object} DecaVersionHistorial
 * @property {string} id
 * @property {string|null} deca_id
 * @property {number} version
 * @property {object} snapshot_json
 * @property {string|null} motivo
 * @property {string} creado_en
 */

export {};
