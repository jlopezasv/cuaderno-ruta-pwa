/**
 * @typedef {import('../constants/EstadosTransportObligation.js').TRANSPORT_OBLIGATION_STATE} TransportObligationStateLiteral
 */

/**
 * Identidad del agregado Planning BC.
 * @typedef {string} TransportObligationId
 */

/**
 * Referencia externa genérica (ERP, WMS, EDI, API). No es identidad de dominio.
 *
 * @typedef {Object} ExternalReference
 * @property {string} source Sistema origen (erp, wms, edi, api, manual).
 * @property {string} externalId Identificador en sistema origen.
 * @property {string|null} [correlationId] Id correlación inter-sistemas.
 */

/**
 * Línea de obligación logística (cantidad / unidad / ubicaciones).
 *
 * @typedef {Object} TransportObligationLine
 * @property {string} lineId
 * @property {string} description
 * @property {number|null} quantity
 * @property {string|null} unit
 * @property {string|null} originLocationRef
 * @property {string|null} destinationLocationRef
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * Transport Obligation — agregado raíz del Planning BC.
 * No es pedido comercial ni expedición.
 *
 * @typedef {Object} TransportObligation
 * @property {TransportObligationId} id
 * @property {string|null} empresaId Tenant (Resource BC).
 * @property {TransportObligationStateLiteral} state
 * @property {ExternalReference|null} externalReference
 * @property {string[]} expeditionIds Expediciones generadas o vinculadas (Execution BC).
 * @property {TransportObligationLine[]} lines
 * @property {string|null} parentObligationId Obligación origen (split/merge).
 * @property {string[]} childObligationIds Obligaciones hijas tras split.
 * @property {string|null} supersededByObligationId Reemplazo tras replanificación.
 * @property {string|null} mergedIntoObligationId Destino tras agrupación.
 * @property {number} replanVersion Incremento en cada replanificación.
 * @property {string|null} cancelledAt
 * @property {string|null} fulfilledAt
 * @property {string} createdAt ISO
 * @property {string} updatedAt ISO
 * @property {number} planningDomainSchemaVersion
 */

/**
 * Vínculo expedición → obligación (1:1 desde expedición).
 *
 * @typedef {Object} ExpeditionObligationLink
 * @property {string} expeditionId Alias Execution: servicio_id.
 * @property {TransportObligationId} transportObligationId
 * @property {string} linkedAt ISO
 * @property {string|null} linkedBy User id opcional.
 */

/**
 * Evento de dominio emitido por el agregado.
 *
 * @typedef {Object} TransportObligationDomainEvent
 * @property {string} type Valor TRANSPORT_OBLIGATION_EVENT.
 * @property {string} occurredAt ISO
 * @property {Record<string, unknown>} payload
 */

export {};
