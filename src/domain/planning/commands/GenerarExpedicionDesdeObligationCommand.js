import { Result } from "../../shared/Result.js";
import { ValidationError } from "../../shared/ValidationError.js";
import { NotFoundError } from "../../shared/NotFoundError.js";
import { BusinessRuleError } from "../../shared/BusinessRuleError.js";
import { TRANSPORT_OBLIGATION_STATE } from "../constants/EstadosTransportObligation.js";
import { VincularExpedicionObligationCommand } from "./VincularExpedicionObligationCommand.js";
import { obligationRouteFromLines } from "../utils/obligationRouteFromLines.js";

/**
 * Genera expedición (servicio pendiente) desde obligación planificada y la vincula.
 */
export class GenerarExpedicionDesdeObligationCommand {
  /**
   * @param {import('../repositories/TransportObligationRepository.js').TransportObligationRepository} obligationRepository
   * @param {import('../repositories/PlanningExpeditionRepository.js').PlanningExpeditionRepository} expeditionRepository
   */
  constructor(obligationRepository, expeditionRepository) {
    this.obligationRepository = obligationRepository;
    this.expeditionRepository = expeditionRepository;
    this.vincularCommand = new VincularExpedicionObligationCommand(obligationRepository);
  }

  /**
   * @param {{
   *   transportObligationId: string,
   *   empresaId: string,
   *   authUid: string,
   *   linkedBy?: string|null,
   *   origen?: string|null,
   *   destino?: string|null,
   *   fechaInicio?: string|null,
   *   cliente?: string|null,
   *   referenciaCliente?: string|null,
   *   responsableUserId?: string|null,
   *   responsableNombre?: string|null,
   * }} input
   */
  async execute(input) {
    if (!input?.transportObligationId || !input?.empresaId || !input?.authUid) {
      return Result.fail(
        new ValidationError("transportObligationId, empresaId and authUid are required")
      );
    }

    const obligation = await this.obligationRepository.findById(input.transportObligationId);
    if (!obligation) {
      return Result.fail(
        new NotFoundError(`Transport obligation ${input.transportObligationId} not found`)
      );
    }

    if (
      obligation.state !== TRANSPORT_OBLIGATION_STATE.PLANNED &&
      obligation.state !== TRANSPORT_OBLIGATION_STATE.IN_EXECUTION &&
      obligation.state !== TRANSPORT_OBLIGATION_STATE.PARTIALLY_FULFILLED
    ) {
      return Result.fail(
        new BusinessRuleError(
          `Obligation must be planned before generating expedition (current: ${obligation.state})`,
          "TO-R13"
        )
      );
    }

    const route = obligationRouteFromLines(obligation.lines);
    const origen = input.origen ?? route.origen;
    const destino = input.destino ?? route.destino;

    try {
      const servicio = await this.expeditionRepository.crearExpedicionPendiente({
        empresaId: input.empresaId,
        authUid: input.authUid,
        transportObligationId: obligation.id,
        origen,
        destino,
        fechaInicio: input.fechaInicio ?? null,
        cliente: input.cliente ?? null,
        referenciaCliente: input.referenciaCliente ?? null,
        responsableUserId: input.responsableUserId ?? null,
        responsableNombre: input.responsableNombre ?? null,
      });

      const expeditionId = String(servicio.id);
      const linkResult = await this.vincularCommand.execute({
        transportObligationId: obligation.id,
        expeditionId,
        linkedBy: input.linkedBy ?? input.authUid,
      });

      if (!linkResult.ok) {
        return linkResult;
      }

      return Result.ok({
        servicio,
        expeditionId,
        obligation: linkResult.value.obligation,
        link: linkResult.value.link,
      });
    } catch (error) {
      return Result.fail(error);
    }
  }
}
