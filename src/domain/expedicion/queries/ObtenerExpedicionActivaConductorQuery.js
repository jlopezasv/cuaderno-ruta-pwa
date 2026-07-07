import { toExpedicion } from "../adapters/LegacyServicioAdapter.js";

/**
 * Obtiene la expedición activa del conductor (proyección de dominio).
 */
export class ObtenerExpedicionActivaConductorQuery {
  /**
   * @param {import('../repositories/ExpedicionRepository.js').ExpedicionRepository} [repository]
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} uid
   * @returns {Promise<import('../types/expedicion.types.js').Expedicion|null>}
   */
  async execute(uid) {
    if (!uid) return null;
    const servicio = await this.repository.obtenerActivaPorConductor(uid);
    return toExpedicion(servicio);
  }
}
