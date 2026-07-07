import { toMovimientosMercancia } from "../adapters/LegacyMovimientoAdapter.js";

/**
 * Obtiene movimientos asociados a una parada concreta.
 */
export class ObtenerMovimientosPorParadaQuery {
  /**
   * @param {import('../repositories/MovimientoRepository.js').MovimientoRepository} [repository]
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} servicioId
   * @param {string} paradaId
   * @returns {Promise<import('../types/expedicion.types.js').MovimientoMercancia[]>}
   */
  async execute(servicioId, paradaId) {
    if (!servicioId) return [];
    const rows = await this.repository.obtenerMovimientosPorParada(servicioId, paradaId);
    return toMovimientosMercancia(rows);
  }
}
