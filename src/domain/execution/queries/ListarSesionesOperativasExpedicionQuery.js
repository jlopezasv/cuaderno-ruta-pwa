/**
 * Lista todas las sesiones operativas de una expedición (activa + historial).
 */
export class ListarSesionesOperativasExpedicionQuery {
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
    if (!expeditionId) return [];
    return this.repository.findAllByExpeditionId(expeditionId);
  }
}
