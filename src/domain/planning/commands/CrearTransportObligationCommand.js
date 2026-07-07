import { Result } from "../../shared/Result.js";
import { ValidationError } from "../../shared/ValidationError.js";
import { createTransportObligation } from "../aggregate/TransportObligation.js";

/**
 * Registra una obligación logística recibida (estado RECEIVED).
 */
export class CrearTransportObligationCommand {
  /**
   * @param {import('../repositories/InMemoryTransportObligationRepository.js').InMemoryTransportObligationRepository | import('../repositories/TransportObligationRepository.js').TransportObligationRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {{
   *   empresaId?: string|null,
   *   externalReference?: import('../types/transportObligation.types.js').ExternalReference|null,
   *   lines?: import('../types/transportObligation.types.js').TransportObligationLine[],
   *   id?: string,
   * }} input
   */
  async execute(input) {
    if (!input || typeof input !== "object") {
      return Result.fail(new ValidationError("Input is required"));
    }
    const { obligation, events } = createTransportObligation({
      id: input.id,
      empresaId: input.empresaId ?? null,
      externalReference: input.externalReference ?? null,
      lines: input.lines,
    });
    await this.repository.save(obligation);
    await this.repository.appendDomainEvents(obligation.id, events);
    return Result.ok({ obligation, events });
  }
}
