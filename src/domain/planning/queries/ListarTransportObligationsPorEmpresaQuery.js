/**
 * Lista Transport Obligations de un tenant (empresa).
 */
export class ListarTransportObligationsPorEmpresaQuery {
  /**
   * @param {import('../repositories/InMemoryTransportObligationRepository.js').InMemoryTransportObligationRepository | import('../repositories/TransportObligationRepository.js').TransportObligationRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} empresaId
   * @param {{ limit?: number, state?: string }} [options]
   */
  async execute(empresaId, options) {
    if (!empresaId) return [];
    return this.repository.findByEmpresaId(empresaId, options);
  }
}
