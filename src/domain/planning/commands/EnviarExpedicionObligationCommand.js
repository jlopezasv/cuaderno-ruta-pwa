import { Result } from "../../shared/Result.js";
import { ValidationError } from "../../shared/ValidationError.js";
import { NotFoundError } from "../../shared/NotFoundError.js";
import { sbFetch } from "../../../data/supabaseClient.js";

/**
 * Asigna conductor, vehículo y remolque a expedición vinculada a obligación; envía al conductor.
 */
export class EnviarExpedicionObligationCommand {
  /**
   * @param {import('../repositories/PlanningExpeditionRepository.js').PlanningExpeditionRepository} expeditionRepository
   * @param {import('../repositories/TransportObligationRepository.js').TransportObligationRepository} obligationRepository
   */
  constructor(expeditionRepository, obligationRepository) {
    this.expeditionRepository = expeditionRepository;
    this.obligationRepository = obligationRepository;
  }

  /**
   * @param {{
   *   transportObligationId: string,
   *   expeditionId: string,
   *   conductorId: string,
   *   conductorNombre?: string|null,
   *   matricula?: string|null,
   *   remolque?: string|null,
   *   servicio?: Record<string, unknown>|null,
   *   notifyAssignment?: (payload: { conductorId: string, servicioId: string, origen?: string, destino?: string, fechaInicio?: string|null }) => Promise<void>|void,
   * }} input
   */
  async execute(input) {
    if (!input?.transportObligationId || !input?.expeditionId || !input?.conductorId) {
      return Result.fail(
        new ValidationError("transportObligationId, expeditionId and conductorId are required")
      );
    }

    const link = await this.obligationRepository.findLinkByExpeditionId(input.expeditionId);
    if (!link || link.transportObligationId !== input.transportObligationId) {
      return Result.fail(
        new NotFoundError(
          `Expedition ${input.expeditionId} is not linked to obligation ${input.transportObligationId}`
        )
      );
    }

    let servicio = input.servicio;
    if (!servicio) {
      const res = await fetchServicio(input.expeditionId);
      servicio = res;
    }
    if (!servicio) {
      return Result.fail(new NotFoundError(`Expedition ${input.expeditionId} not found`));
    }

    try {
      const { assignResult, servicio: updated } =
        await this.expeditionRepository.asignarYEnviarAlConductor({
          servicioId: input.expeditionId,
          servicio,
          conductorId: input.conductorId,
          conductorNombre: input.conductorNombre ?? null,
          matricula: input.matricula ?? null,
          remolque: input.remolque ?? null,
          notifyAssignment: input.notifyAssignment,
        });

      return Result.ok({ servicio: updated, assignResult, link });
    } catch (error) {
      return Result.fail(error);
    }
  }
}

async function fetchServicio(servicioId) {
  const res = await sbFetch(
    `/rest/v1/servicios?id=eq.${encodeURIComponent(servicioId)}&select=*&limit=1`
  );
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}
