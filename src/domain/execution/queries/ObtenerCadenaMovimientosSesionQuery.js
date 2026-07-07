import { toMovimientosMercancia } from "../../expedicion/adapters/LegacyMovimientoAdapter.js";

/**
 * Cadena Expedición → Operational Session → Movimientos (lectura).
 * No altera balance ni Compliance.
 */
export class ObtenerCadenaMovimientosSesionQuery {
  /**
   * @param {import('../repositories/InMemoryOperationalSessionRepository.js').InMemoryOperationalSessionRepository | import('../repositories/OperationalSessionRepository.js').OperationalSessionRepository} sessionRepository
   * @param {import('../../expedicion/repositories/MovimientoRepository.js').MovimientoRepository} [movimientoRepository]
   */
  constructor(sessionRepository, movimientoRepository) {
    this.sessionRepository = sessionRepository;
    this.movimientoRepository = movimientoRepository;
  }

  /**
   * @param {string} expeditionId
   * @param {string} sessionId
   * @returns {Promise<import('../types/operationalSession.types.js').OperationalSessionMovementChain|null>}
   */
  async execute(expeditionId, sessionId) {
    if (!expeditionId || !sessionId) return null;

    const session = await this.sessionRepository.findById(expeditionId, sessionId);
    if (!session) return null;

    const movementRefs = session.movementRefs;

    if (!this.movimientoRepository) {
      return { session, movementRefs, movimientos: [] };
    }

    const decaIds = new Set(
      movementRefs.map((ref) => ref.decaMovimientoId).filter(Boolean)
    );

    if (decaIds.size === 0) {
      return { session, movementRefs, movimientos: [] };
    }

    const rows = await this.movimientoRepository.listarMovimientos(expeditionId);
    const filtered = Array.isArray(rows)
      ? rows.filter((row) => decaIds.has(String(row.id || "")))
      : [];

    return {
      session,
      movementRefs,
      movimientos: toMovimientosMercancia(filtered),
    };
  }
}
