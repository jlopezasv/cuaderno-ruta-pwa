/**
 * Obtiene una sesión operativa por identificador dentro de una expedición.
 */
export class ObtenerSesionOperativaQuery {
  /**
   * @param {import('../repositories/InMemoryOperationalSessionRepository.js').InMemoryOperationalSessionRepository | import('../repositories/OperationalSessionRepository.js').OperationalSessionRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} expeditionId
   * @param {string} sessionId
   */
  async execute(expeditionId, sessionId) {
    if (!expeditionId || !sessionId) return null;
    return this.repository.findById(expeditionId, sessionId);
  }
}
