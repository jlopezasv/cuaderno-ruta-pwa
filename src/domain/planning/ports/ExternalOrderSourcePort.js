/**
 * Payload normalizado recibido desde cualquier conector externo.
 *
 * @typedef {Object} InboundTransportObligationPayload
 * @property {string} source erp | wms | edi | api | manual
 * @property {string} externalId
 * @property {string|null} [correlationId]
 * @property {string|null} [empresaId]
 * @property {import('../types/transportObligation.types.js').TransportObligationLine[]} [lines]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * Resultado de importación ACL.
 *
 * @typedef {Object} InboundTransportObligationResult
 * @property {boolean} accepted
 * @property {string|null} transportObligationId
 * @property {string|null} rejectionReason
 * @property {Record<string, unknown>} [diagnostics]
 */

/**
 * Puerto de entrada genérico para obligaciones desde sistemas externos.
 * Implementaciones futuras: adapters ERP/WMS/EDI/API.
 *
 * @interface ExternalOrderSourcePort
 */
export class ExternalOrderSourcePort {
  /**
   * Recibe y normaliza una obligación externa hacia el dominio Planning.
   * @param {InboundTransportObligationPayload} payload
   * @returns {Promise<InboundTransportObligationResult>}
   */
  async receiveObligation(payload) {
    throw new Error("ExternalOrderSourcePort.receiveObligation not implemented");
  }

  /**
   * Confirma recepción al sistema origen (ACK).
   * @param {string} transportObligationId
   * @param {string} externalId
   * @returns {Promise<void>}
   */
  async acknowledgeReceipt(transportObligationId, externalId) {
    throw new Error("ExternalOrderSourcePort.acknowledgeReceipt not implemented");
  }
}

export {};
