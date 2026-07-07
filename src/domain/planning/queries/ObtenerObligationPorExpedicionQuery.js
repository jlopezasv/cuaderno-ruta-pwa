/**
 * Resuelve la obligación vinculada a una expedición (Execution BC).
 */
export class ObtenerObligationPorExpedicionQuery {
  /**
   * @param {import('../repositories/InMemoryTransportObligationRepository.js').InMemoryTransportObligationRepository | import('../repositories/TransportObligationRepository.js').TransportObligationRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} expeditionId servicio_id
   * @returns {Promise<{ link: import('../types/transportObligation.types.js').ExpeditionObligationLink, obligation: import('../types/transportObligation.types.js').TransportObligation }|null>}
   */
  async execute(expeditionId) {
    if (!expeditionId) return null;
    const link = await this.repository.findLinkByExpeditionId(expeditionId);
    if (!link) return null;
    const obligation = await this.repository.findById(link.transportObligationId);
    if (!obligation) return null;
    return { link, obligation };
  }
}
