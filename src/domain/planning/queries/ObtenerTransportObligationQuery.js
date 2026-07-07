/**
 * Obtiene una Transport Obligation por identificador.
 */
export class ObtenerTransportObligationQuery {
  /**
   * @param {import('../repositories/InMemoryTransportObligationRepository.js').InMemoryTransportObligationRepository | import('../repositories/TransportObligationRepository.js').TransportObligationRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} transportObligationId
   * @returns {Promise<import('../types/transportObligation.types.js').TransportObligation|null>}
   */
  async execute(transportObligationId) {
    if (!transportObligationId) return null;
    return this.repository.findById(transportObligationId);
  }
}
