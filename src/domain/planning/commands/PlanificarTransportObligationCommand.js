import { Result } from "../../shared/Result.js";
import { ValidationError } from "../../shared/ValidationError.js";
import { NotFoundError } from "../../shared/NotFoundError.js";
import { planTransportObligation } from "../aggregate/TransportObligation.js";

/**
 * Transiciona obligación RECEIVED → PLANNED.
 */
export class PlanificarTransportObligationCommand {
  /**
   * @param {import('../repositories/InMemoryTransportObligationRepository.js').InMemoryTransportObligationRepository | import('../repositories/TransportObligationRepository.js').TransportObligationRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} transportObligationId
   */
  async execute(transportObligationId) {
    if (!transportObligationId) {
      return Result.fail(new ValidationError("transportObligationId is required"));
    }
    const current = await this.repository.findById(transportObligationId);
    if (!current) {
      return Result.fail(new NotFoundError(`Transport obligation ${transportObligationId} not found`));
    }
    try {
      const { obligation, events } = planTransportObligation(current);
      await this.repository.save(obligation);
      await this.repository.appendDomainEvents(obligation.id, events);
      return Result.ok({ obligation, events });
    } catch (error) {
      return Result.fail(error);
    }
  }
}
