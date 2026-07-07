/**
 * Orquestador hexagonal Planning BC.
 * Compone conectores con commands de dominio sin acoplar Execution.
 *
 * @typedef {Object} PlanningIntegrationCapabilities
 * @property {boolean} erp
 * @property {boolean} wms
 * @property {boolean} edi
 * @property {boolean} api
 */

/**
 * @interface PlanningIntegrationPort
 */
export class PlanningIntegrationPort {
  /**
   * @returns {PlanningIntegrationCapabilities}
   */
  getCapabilities() {
    throw new Error("PlanningIntegrationPort.getCapabilities not implemented");
  }

  /**
   * Sincroniza obligaciones entrantes según capabilities del tenant.
   * @param {{ empresaId: string }} context
   * @returns {Promise<{ imported: number, rejected: number }>}
   */
  async syncInboundObligations(context) {
    throw new Error("PlanningIntegrationPort.syncInboundObligations not implemented");
  }

  /**
   * Publica estado de obligaciones hacia sistemas externos.
   * @param {{ transportObligationId: string }} context
   * @returns {Promise<void>}
   */
  async syncOutboundStatus(context) {
    throw new Error("PlanningIntegrationPort.syncOutboundStatus not implemented");
  }
}

export { ExternalOrderSourcePort } from "./ExternalOrderSourcePort.js";
export { ErpConnectorPort } from "./ErpConnectorPort.js";
export { WmsConnectorPort } from "./WmsConnectorPort.js";
export { EdiConnectorPort } from "./EdiConnectorPort.js";
export { ApiConnectorPort } from "./ApiConnectorPort.js";
