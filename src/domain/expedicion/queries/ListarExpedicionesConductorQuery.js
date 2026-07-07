import { toExpedicion } from "../adapters/LegacyServicioAdapter.js";

/**
 * Lista expeditions del conductor como objetos de dominio.
 */
export class ListarExpedicionesConductorQuery {
  /**
   * @param {import('../repositories/ExpedicionRepository.js').ExpedicionRepository} [repository]
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} uid
   * @param {{ limit?: number }} [options]
   * @returns {Promise<import('../types/expedicion.types.js').Expedicion[]>}
   */
  async execute(uid, options) {
    if (!uid) return [];
    const rows = await this.repository.listarPorConductor(uid, options);
    return (Array.isArray(rows) ? rows : []).map(toExpedicion).filter(Boolean);
  }
}
