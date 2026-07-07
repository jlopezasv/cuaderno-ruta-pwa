import { toInventarioVivo } from "../adapters/LegacyInventarioAdapter.js";

/**
 * Obtiene inventario DeCA vivo completo (stock + últimos movimientos).
 */
export class ObtenerInventarioVivoQuery {
  /**
   * @param {import('../repositories/InventarioRepository.js').InventarioRepository} [repository]
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} servicioId
   * @returns {Promise<import('../types/expedicion.types.js').InventarioVivo|null>}
   */
  async execute(servicioId) {
    if (!servicioId) return null;
    const raw = await this.repository.obtenerInventarioVivo(servicioId);
    return toInventarioVivo(raw);
  }
}
