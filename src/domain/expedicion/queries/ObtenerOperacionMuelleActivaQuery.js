import { toOperacionMuelleActiva } from "../adapters/LegacyServicioAdapter.js";

/**
 * Obtiene la operación de muelle activa de una expedición.
 */
export class ObtenerOperacionMuelleActivaQuery {
  /**
   * @param {import('../repositories/ExpedicionRepository.js').ExpedicionRepository} [repository]
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} servicioId
   * @returns {Promise<import('../types/expedicion.types.js').OperacionMuelle|null>}
   */
  async execute(servicioId) {
    if (!servicioId) return null;
    const servicio = await this.repository.obtenerServicio(servicioId);
    return toOperacionMuelleActiva(servicio);
  }
}
