/**
 * @typedef {import('./ExternalOrderSourcePort.js').InboundTransportObligationPayload} InboundTransportObligationPayload
 */

/**
 * Consulta de estado de obligación hacia ERP.
 *
 * @typedef {Object} ErpObligationStatusUpdate
 * @property {string} externalId
 * @property {string} transportObligationId
 * @property {string} state
 * @property {string|null} [fulfilledAt]
 */

/**
 * Puerto de integración ERP → Planning BC.
 * Responsabilidad: recibir obligaciones maestras y publicar estado de ejecución.
 *
 * @interface ErpConnectorPort
 */
export class ErpConnectorPort {
  /**
   * Pull o webhook de obligaciones pendientes.
   * @param {{ empresaId: string, since?: string }} filter
   * @returns {Promise<InboundTransportObligationPayload[]>}
   */
  async fetchPendingObligations(filter) {
    throw new Error("ErpConnectorPort.fetchPendingObligations not implemented");
  }

  /**
   * Notifica estado de obligación al ERP.
   * @param {ErpObligationStatusUpdate} update
   * @returns {Promise<void>}
   */
  async publishExecutionStatus(update) {
    throw new Error("ErpConnectorPort.publishExecutionStatus not implemented");
  }
}

export {};
