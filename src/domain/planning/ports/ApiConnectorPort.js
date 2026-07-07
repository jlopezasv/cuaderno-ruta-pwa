/**
 * @typedef {import('./ExternalOrderSourcePort.js').InboundTransportObligationPayload} InboundTransportObligationPayload
 * @typedef {import('./ExternalOrderSourcePort.js').InboundTransportObligationResult} InboundTransportObligationResult
 */

/**
 * Autenticación de webhook/API partner.
 *
 * @typedef {Object} ApiConnectorAuthContext
 * @property {string} tenantKey
 * @property {string|null} [apiKeyId]
 * @property {Record<string, unknown>} [claims]
 */

/**
 * Puerto API REST/webhook → Planning BC.
 *
 * @interface ApiConnectorPort
 */
export class ApiConnectorPort {
  /**
   * @param {ApiConnectorAuthContext} auth
   * @param {InboundTransportObligationPayload} payload
   * @returns {Promise<InboundTransportObligationResult>}
   */
  async ingestObligation(auth, payload) {
    throw new Error("ApiConnectorPort.ingestObligation not implemented");
  }

  /**
   * Consulta read-only para partners.
   * @param {string} transportObligationId
   * @returns {Promise<Record<string, unknown>|null>}
   */
  async getObligationSnapshot(transportObligationId) {
    throw new Error("ApiConnectorPort.getObligationSnapshot not implemented");
  }
}

export {};
