import {
  toOperationalSessionActiveFromServicio,
  toOperationalSessionsFromHistorial,
} from "../adapters/LegacyOperacionMuelleAdapter.js";

/**
 * Lectura de Operational Session sobre meta legacy (`operacion_muelle_activa`).
 * Delega en ExpedicionRepository; no altera persistencia ni comportamiento muelle.
 */
export class OperationalSessionRepository {
  /**
   * @param {import('../../expedicion/repositories/ExpedicionRepository.js').ExpedicionRepository} expedicionRepository
   */
  constructor(expedicionRepository) {
    if (!expedicionRepository) {
      throw new Error("OperationalSessionRepository requires expedicionRepository");
    }
    this.expedicionRepository = expedicionRepository;
  }

  /**
   * @param {string} expeditionId
   * @returns {Promise<import('../types/operationalSession.types.js').OperationalSession|null>}
   */
  async findActiveByExpeditionId(expeditionId) {
    if (!expeditionId) return null;
    const servicio = await this.expedicionRepository.obtenerServicio(expeditionId);
    return toOperationalSessionActiveFromServicio(servicio);
  }

  /**
   * @param {string} expeditionId
   * @returns {Promise<import('../types/operationalSession.types.js').OperationalSession[]>}
   */
  async findHistoryByExpeditionId(expeditionId) {
    if (!expeditionId) return [];
    const servicio = await this.expedicionRepository.obtenerServicio(expeditionId);
    return toOperationalSessionsFromHistorial(servicio);
  }

  /**
   * @param {string} expeditionId
   * @returns {Promise<import('../types/operationalSession.types.js').OperationalSession[]>}
   */
  async findAllByExpeditionId(expeditionId) {
    const active = await this.findActiveByExpeditionId(expeditionId);
    const history = await this.findHistoryByExpeditionId(expeditionId);
    return [...(active ? [active] : []), ...history];
  }

  /**
   * @param {string} expeditionId
   * @param {string} sessionId
   * @returns {Promise<import('../types/operationalSession.types.js').OperationalSession|null>}
   */
  async findById(expeditionId, sessionId) {
    if (!expeditionId || !sessionId) return null;
    const sessions = await this.findAllByExpeditionId(expeditionId);
    return sessions.find((s) => s.id === sessionId) ?? null;
  }
}
