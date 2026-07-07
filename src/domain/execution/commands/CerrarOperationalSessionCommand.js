import { Result } from "../../shared/Result.js";
import { ValidationError } from "../../shared/ValidationError.js";
import { NotFoundError } from "../../shared/NotFoundError.js";
import { closeOperationalSession } from "../aggregate/OperationalSession.js";

/**
 * Cierra sesión operativa abierta.
 */
export class CerrarOperationalSessionCommand {
  /**
   * @param {import('../repositories/InMemoryOperationalSessionRepository.js').InMemoryOperationalSessionRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} expeditionId
   * @param {string} sessionId
   * @param {{ exitObservation?: string|null, closedWithoutChanges?: boolean, durationMinutes?: number|null }} [options]
   */
  async execute(expeditionId, sessionId, options = {}) {
    if (!expeditionId || !sessionId) {
      return Result.fail(new ValidationError("expeditionId and sessionId are required"));
    }
    const current = await this.repository.findById(expeditionId, sessionId);
    if (!current) {
      return Result.fail(new NotFoundError(`Operational session ${sessionId} not found`));
    }
    try {
      const { session, events } = closeOperationalSession(current, options);
      await this.repository.save(session);
      return Result.ok({ session, events });
    } catch (error) {
      return Result.fail(error);
    }
  }
}
