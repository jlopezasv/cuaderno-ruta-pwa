import { Result } from "../../shared/Result.js";
import { ValidationError } from "../../shared/ValidationError.js";
import {
  openOperationalSessionGuarded,
} from "../aggregate/OperationalSession.js";

/**
 * Abre sesión operativa (dominio puro; persistencia vía repositorio inyectado).
 */
export class AbrirOperationalSessionCommand {
  /**
   * @param {import('../repositories/InMemoryOperationalSessionRepository.js').InMemoryOperationalSessionRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {{
   *   expeditionId: string,
   *   sessionKind?: string,
   *   location: import('../types/operationalSession.types.js').OperationalSessionLocation,
   *   actor?: import('../types/operationalSession.types.js').OperationalSessionActor,
   *   resources?: import('../types/operationalSession.types.js').OperationalSessionResources,
   *   entryObservation?: string|null,
   *   id?: string,
   * }} input
   */
  async execute(input) {
    if (!input?.expeditionId || !input?.location?.name) {
      return Result.fail(new ValidationError("expeditionId and location.name are required"));
    }
    try {
      const active = await this.repository.findActiveByExpeditionId(input.expeditionId);
      const { session, events } = openOperationalSessionGuarded(active, input);
      await this.repository.save(session);
      return Result.ok({ session, events });
    } catch (error) {
      return Result.fail(error);
    }
  }
}
