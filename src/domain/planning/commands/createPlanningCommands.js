import { transportObligationRepository } from "../repositories/TransportObligationRepository.js";
import { CrearTransportObligationCommand } from "./CrearTransportObligationCommand.js";
import { PlanificarTransportObligationCommand } from "./PlanificarTransportObligationCommand.js";
import { CancelarTransportObligationCommand } from "./CancelarTransportObligationCommand.js";
import { ReplanificarTransportObligationCommand } from "./ReplanificarTransportObligationCommand.js";

/**
 * Factory con repositorio Supabase por defecto (runtime).
 * No importar en tests unitarios — inyectar InMemoryTransportObligationRepository.
 *
 * @param {{
 *   transportObligationRepository?: import('../repositories/TransportObligationRepository.js').TransportObligationRepository
 *     | import('../repositories/InMemoryTransportObligationRepository.js').InMemoryTransportObligationRepository,
 * }} [deps]
 */
export function createPlanningCommands(deps = {}) {
  const repo = deps.transportObligationRepository ?? transportObligationRepository;

  return {
    crearTransportObligation: new CrearTransportObligationCommand(repo),
    planificarTransportObligation: new PlanificarTransportObligationCommand(repo),
    cancelarTransportObligation: new CancelarTransportObligationCommand(repo),
    replanificarTransportObligation: new ReplanificarTransportObligationCommand(repo),
  };
}
