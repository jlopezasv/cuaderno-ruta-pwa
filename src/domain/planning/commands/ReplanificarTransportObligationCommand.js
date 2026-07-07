import { Result } from "../../shared/Result.js";
import { ValidationError } from "../../shared/ValidationError.js";
import { NotFoundError } from "../../shared/NotFoundError.js";
import { replanTransportObligation } from "../aggregate/TransportObligation.js";

/**
 * Replanifica: marca obligación actual como SUPERSEDED y crea reemplazo PLANNED.
 */
export class ReplanificarTransportObligationCommand {
  /**
   * @param {import('../repositories/InMemoryTransportObligationRepository.js').InMemoryTransportObligationRepository | import('../repositories/TransportObligationRepository.js').TransportObligationRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} transportObligationId
   * @param {string} [replacementId]
   */
  async execute(transportObligationId, replacementId) {
    if (!transportObligationId) {
      return Result.fail(new ValidationError("transportObligationId is required"));
    }
    const current = await this.repository.findById(transportObligationId);
    if (!current) {
      return Result.fail(new NotFoundError(`Transport obligation ${transportObligationId} not found`));
    }
    try {
      const { supersededObligation, replacementObligation, events } = replanTransportObligation(
        current,
        replacementId
      );
      await this.repository.save(supersededObligation);
      await this.repository.save(replacementObligation);
      await this.repository.appendDomainEvents(supersededObligation.id, events);
      return Result.ok({ supersededObligation, replacementObligation, events });
    } catch (error) {
      return Result.fail(error);
    }
  }
}
