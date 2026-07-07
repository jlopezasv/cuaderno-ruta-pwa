import { toInventarioActual } from "../adapters/LegacyInventarioAdapter.js";

/**
 * Obtiene el stock actual a bordo (proyección de dominio).
 */
export class ObtenerInventarioActualQuery {
  /**
   * @param {import('../repositories/InventarioRepository.js').InventarioRepository} [repository]
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} servicioId
   * @returns {Promise<import('../types/expedicion.types.js').InventarioActual>}
   */
  async execute(servicioId) {
    if (!servicioId) {
      return toInventarioActual("", { stock: [], documento: null });
    }
    const raw = await this.repository.obtenerStockActual(servicioId);
    return toInventarioActual(servicioId, raw);
  }
}
