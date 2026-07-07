import { Result } from "../../shared/Result.js";
import { ValidationError } from "../../shared/ValidationError.js";
import { NotFoundError } from "../../shared/NotFoundError.js";
import { linkExpeditionToTransportObligation } from "../aggregate/TransportObligation.js";
import { assertExpeditionNotAlreadyLinked } from "../rules/transportObligationRules.js";

/**
 * Vincula una expedición existente (Execution) a una Transport Obligation.
 * No altera flujos operativos de la expedición; solo persiste la relación.
 */
export class VincularExpedicionObligationCommand {
  /**
   * @param {import('../repositories/InMemoryTransportObligationRepository.js').InMemoryTransportObligationRepository | import('../repositories/TransportObligationRepository.js').TransportObligationRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {{
   *   transportObligationId: string,
   *   expeditionId: string,
   *   linkedBy?: string|null,
   * }} input
   */
  async execute(input) {
    if (!input?.transportObligationId || !input?.expeditionId) {
      return Result.fail(new ValidationError("transportObligationId and expeditionId are required"));
    }

    const obligation = await this.repository.findById(input.transportObligationId);
    if (!obligation) {
      return Result.fail(
        new NotFoundError(`Transport obligation ${input.transportObligationId} not found`)
      );
    }

    const existingLink = await this.repository.findLinkByExpeditionId(input.expeditionId);
    try {
      assertExpeditionNotAlreadyLinked(existingLink, input.expeditionId);
    } catch (error) {
      return Result.fail(error);
    }

    try {
      const { obligation: updated, events } = linkExpeditionToTransportObligation(
        obligation,
        input.expeditionId
      );
      const linkedAt = new Date().toISOString();
      const link = {
        expeditionId: input.expeditionId,
        transportObligationId: input.transportObligationId,
        linkedAt,
        linkedBy: input.linkedBy ?? null,
      };

      await this.repository.save(updated);
      await this.repository.saveExpeditionLink(link);
      await this.repository.appendDomainEvents(updated.id, events);

      return Result.ok({ obligation: updated, link, events });
    } catch (error) {
      return Result.fail(error);
    }
  }
}
