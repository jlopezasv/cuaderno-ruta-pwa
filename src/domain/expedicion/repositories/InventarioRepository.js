import {
  fetchDecaActualVisible,
  fetchDecaMovimientos,
  obtenerInventarioActual,
} from "../../dcdt/decaVivoModel.js";

/**
 * Fachada de lectura sobre inventario DeCA vivo.
 * Delega exclusivamente en decaVivoModel sin duplicar lógica.
 */
export class InventarioRepository {
  /**
   * DeCA visible + stock + últimos movimientos.
   * @param {string} servicioId
   */
  async obtenerInventarioVivo(servicioId) {
    return fetchDecaActualVisible(servicioId);
  }

  /**
   * Stock actual a bordo y documento DeCA asociado.
   * @param {string} servicioId
   */
  async obtenerStockActual(servicioId) {
    return obtenerInventarioActual(servicioId);
  }

  /**
   * Trazabilidad completa de movimientos del servicio.
   * @param {string} servicioId
   */
  async obtenerMovimientos(servicioId) {
    return fetchDecaMovimientos(servicioId);
  }
}

export const inventarioRepository = new InventarioRepository();
