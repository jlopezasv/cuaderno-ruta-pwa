import { Result } from "../../shared/Result.js";
import { ValidationError } from "../../shared/ValidationError.js";
import { NotFoundError } from "../../shared/NotFoundError.js";
import { registerMovementInOperationalSession } from "../aggregate/OperationalSession.js";

/**
 * Registra referencia de movimiento en sesión abierta (dominio; no escribe DeCA).
 */
export class RegistrarMovimientoEnSesionCommand {
  /**
   * @param {import('../repositories/InMemoryOperationalSessionRepository.js').InMemoryOperationalSessionRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} expeditionId
   * @param {string} sessionId
   * @param {import('../types/operationalSession.types.js').SessionMovementRef} movementRef
   */
  async execute(expeditionId, sessionId, movementRef) {
    if (!expeditionId || !sessionId || !movementRef?.sessionMovementId) {
      return Result.fail(new ValidationError("expeditionId, sessionId and movementRef are required"));
    }
    const current = await this.repository.findById(expeditionId, sessionId);
    if (!current) {
      return Result.fail(new NotFoundError(`Operational session ${sessionId} not found`));
    }
    try {
      const { session, events } = registerMovementInOperationalSession(current, movementRef);
      await this.repository.save(session);
      return Result.ok({ session, events });
    } catch (error) {
      return Result.fail(error);
    }
  }
}
