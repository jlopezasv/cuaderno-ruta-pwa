/**
 * @typedef {import('./ExternalOrderSourcePort.js').InboundTransportObligationPayload} InboundTransportObligationPayload
 */

/**
 * Confirmación de preparación en almacén.
 *
 * @typedef {Object} WmsPreparationConfirmation
 * @property {string} externalId
 * @property {string} transportObligationId
 * @property {boolean} readyForLoading
 * @property {Record<string, unknown>} [handlingUnits]
 */

/**
 * Puerto WMS → Planning BC.
 * Responsabilidad: obligaciones de expedición desde almacén y estado de preparación.
 *
 * @interface WmsConnectorPort
 */
export class WmsConnectorPort {
  /**
   * @param {{ empresaId: string, dockDate?: string }} filter
   * @returns {Promise<InboundTransportObligationPayload[]>}
   */
  async fetchDispatchObligations(filter) {
    throw new Error("WmsConnectorPort.fetchDispatchObligations not implemented");
  }

  /**
   * @param {WmsPreparationConfirmation} confirmation
   * @returns {Promise<void>}
   */
  async confirmPreparation(confirmation) {
    throw new Error("WmsConnectorPort.confirmPreparation not implemented");
  }
}

export {};
