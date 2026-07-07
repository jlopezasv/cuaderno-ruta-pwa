/**
 * Mensaje EDI normalizado (DESADV, IFTMIN, etc.) sin acoplar a segmento concreto en dominio.
 *
 * @typedef {Object} EdiInboundMessage
 * @property {string} messageType
 * @property {string} interchangeId
 * @property {string} rawPayload Referencia al mensaje; parsing en adapter infra.
 * @property {string|null} [empresaId]
 */

/**
 * @typedef {import('./ExternalOrderSourcePort.js').InboundTransportObligationResult} InboundTransportObligationResult
 */

/**
 * Puerto EDI → Planning BC.
 *
 * @interface EdiConnectorPort
 */
export class EdiConnectorPort {
  /**
   * @param {EdiInboundMessage} message
   * @returns {Promise<InboundTransportObligationResult>}
   */
  async processInboundMessage(message) {
    throw new Error("EdiConnectorPort.processInboundMessage not implemented");
  }

  /**
   * Genera mensaje de estado hacia partner EDI.
   * @param {{ transportObligationId: string, state: string, externalId: string }} status
   * @returns {Promise<{ outboundMessageId: string }>}
   */
  async emitStatusMessage(status) {
    throw new Error("EdiConnectorPort.emitStatusMessage not implemented");
  }
}

export {};
