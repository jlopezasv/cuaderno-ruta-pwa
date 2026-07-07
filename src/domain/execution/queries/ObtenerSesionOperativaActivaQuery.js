/**
 * Obtiene la sesión operativa abierta de una expedición.
 */
export class ObtenerSesionOperativaActivaQuery {
  /**
   * @param {import('../repositories/InMemoryOperationalSessionRepository.js').InMemoryOperationalSessionRepository | import('../repositories/OperationalSessionRepository.js').OperationalSessionRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} expeditionId
   */
  async execute(expeditionId) {
    if (!expeditionId) return null;
    return this.repository.findActiveByExpeditionId(expeditionId);
  }
}
