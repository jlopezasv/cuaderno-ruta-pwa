import { Result } from "../../shared/Result.js";
import { ValidationError } from "../../shared/ValidationError.js";
import { NotFoundError } from "../../shared/NotFoundError.js";
import { BusinessRuleError } from "../../shared/BusinessRuleError.js";
import { isTransportObligationTerminal } from "../constants/EstadosTransportObligation.js";

/**
 * Actualiza datos editables de una obligación (líneas, referencia externa).
 */
export class ActualizarTransportObligationCommand {
  /**
   * @param {import('../repositories/InMemoryTransportObligationRepository.js').InMemoryTransportObligationRepository | import('../repositories/TransportObligationRepository.js').TransportObligationRepository} repository
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} transportObligationId
   * @param {{
   *   lines?: import('../types/transportObligation.types.js').TransportObligationLine[],
   *   externalReference?: import('../types/transportObligation.types.js').ExternalReference|null,
   * }} patch
   */
  async execute(transportObligationId, patch) {
    if (!transportObligationId) {
      return Result.fail(new ValidationError("transportObligationId is required"));
    }
    const current = await this.repository.findById(transportObligationId);
    if (!current) {
      return Result.fail(new NotFoundError(`Transport obligation ${transportObligationId} not found`));
    }
    if (isTransportObligationTerminal(current.state)) {
      return Result.fail(
        new BusinessRuleError(
          `Cannot update obligation in terminal state ${current.state}`,
          "TO-R12"
        )
      );
    }

    const now = new Date().toISOString();
    const obligation = {
      ...current,
      lines: patch?.lines != null ? [...patch.lines] : current.lines,
      externalReference:
        patch?.externalReference !== undefined ? patch.externalReference : current.externalReference,
      updatedAt: now,
    };

    await this.repository.save(obligation);
    return Result.ok({ obligation });
  }
}
