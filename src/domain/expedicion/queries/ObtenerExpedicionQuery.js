/**
 * Obtiene una expedición por identificador (proyección de dominio).
 */
export class ObtenerExpedicionQuery {
  /**
   * @param {import('../repositories/ExpedicionRepository.js').ExpedicionRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} servicioId
   * @returns {Promise<import('../types/expedicion.types.js').Expedicion|null>}
   */
  async execute(servicioId) {
    if (!servicioId) return null;
    return this.repository.obtenerExpedicion(servicioId);
  }
}
