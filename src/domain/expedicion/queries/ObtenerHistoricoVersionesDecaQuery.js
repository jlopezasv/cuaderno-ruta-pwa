import { toVersionesDecaHistorial } from "../adapters/LegacyInventarioAdapter.js";

/**
 * Obtiene histórico de versiones DeCA de una expedición.
 */
export class ObtenerHistoricoVersionesDecaQuery {
  /**
   * @param {import('../repositories/MovimientoRepository.js').MovimientoRepository} [repository]
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} servicioId
   * @returns {Promise<import('../types/expedicion.types.js').VersionDecaHistorial[]>}
   */
  async execute(servicioId) {
    if (!servicioId) return [];
    const rows = await this.repository.obtenerHistoricoVersiones(servicioId);
    return toVersionesDecaHistorial(rows);
  }
}
