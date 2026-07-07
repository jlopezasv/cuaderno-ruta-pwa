/**
 * Punto de extensión futuro: Centro Logístico → Planning BC.
 * Sprint 5: contrato únicamente; sin implementación WMS ni hoja de carga.
 *
 * @typedef {Object} CentroLogisticoPlanningContext
 * @property {string} empresaId
 * @property {boolean} preparationEnabled
 * @property {boolean} dockSessionEnabled
 */

/**
 * @interface CentroLogisticoExtensionPort
 */
export class CentroLogisticoExtensionPort {
  /**
   * @param {CentroLogisticoPlanningContext} _context
   * @returns {Promise<{ enabled: boolean, capabilities: string[] }>}
   */
  async getPlanningCapabilities(_context) {
    throw new Error("CentroLogisticoExtensionPort.getPlanningCapabilities not implemented");
  }

  /**
   * Reservado: importar obligaciones desde preparación de almacén.
   * @param {CentroLogisticoPlanningContext} _context
   */
  async importObligationsFromWarehouse(_context) {
    throw new Error("CentroLogisticoExtensionPort.importObligationsFromWarehouse not implemented");
  }
}

export {};
