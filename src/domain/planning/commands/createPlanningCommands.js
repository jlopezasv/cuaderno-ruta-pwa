import { transportObligationRepository } from "../repositories/TransportObligationRepository.js";
import { planningExpeditionRepository } from "../repositories/PlanningExpeditionRepository.js";
import { CrearTransportObligationCommand } from "./CrearTransportObligationCommand.js";
import { ActualizarTransportObligationCommand } from "./ActualizarTransportObligationCommand.js";
import { PlanificarTransportObligationCommand } from "./PlanificarTransportObligationCommand.js";
import { CancelarTransportObligationCommand } from "./CancelarTransportObligationCommand.js";
import { ReplanificarTransportObligationCommand } from "./ReplanificarTransportObligationCommand.js";
import { VincularExpedicionObligationCommand } from "./VincularExpedicionObligationCommand.js";
import { GenerarExpedicionDesdeObligationCommand } from "./GenerarExpedicionDesdeObligationCommand.js";
import { EnviarExpedicionObligationCommand } from "./EnviarExpedicionObligationCommand.js";

/**
 * Factory con repositorio Supabase por defecto (runtime).
 * No importar en tests unitarios — inyectar InMemoryTransportObligationRepository.
 *
 * @param {{
 *   transportObligationRepository?: import('../repositories/TransportObligationRepository.js').TransportObligationRepository
 *     | import('../repositories/InMemoryTransportObligationRepository.js').InMemoryTransportObligationRepository,
 *   planningExpeditionRepository?: import('../repositories/PlanningExpeditionRepository.js').PlanningExpeditionRepository,
 * }} [deps]
 */
export function createPlanningCommands(deps = {}) {
  const repo = deps.transportObligationRepository ?? transportObligationRepository;
  const expRepo = deps.planningExpeditionRepository ?? planningExpeditionRepository;

  return {
    crearTransportObligation: new CrearTransportObligationCommand(repo),
    actualizarTransportObligation: new ActualizarTransportObligationCommand(repo),
    planificarTransportObligation: new PlanificarTransportObligationCommand(repo),
    cancelarTransportObligation: new CancelarTransportObligationCommand(repo),
    replanificarTransportObligation: new ReplanificarTransportObligationCommand(repo),
    vincularExpedicionObligation: new VincularExpedicionObligationCommand(repo),
    generarExpedicionDesdeObligation: new GenerarExpedicionDesdeObligationCommand(repo, expRepo),
    enviarExpedicionObligation: new EnviarExpedicionObligationCommand(expRepo, repo),
  };
}
