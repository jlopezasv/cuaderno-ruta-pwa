import { toMovimientosMercancia } from "../adapters/LegacyMovimientoAdapter.js";

/**
 * Lista movimientos de mercancía de una expedición.
 */
export class ListarMovimientosExpedicionQuery {
  /**
   * @param {import('../repositories/InventarioRepository.js').InventarioRepository} [repository]
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} servicioId
   * @returns {Promise<import('../types/expedicion.types.js').MovimientoMercancia[]>}
   */
  async execute(servicioId) {
    if (!servicioId) return [];
    const rows = await this.repository.obtenerMovimientos(servicioId);
    return toMovimientosMercancia(rows);
  }
}
