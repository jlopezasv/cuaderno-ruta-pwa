import { InMemoryOperationalSessionRepository } from "../repositories/InMemoryOperationalSessionRepository.js";
import { ObtenerSesionOperativaActivaQuery } from "./ObtenerSesionOperativaActivaQuery.js";
import { ListarSesionesOperativasExpedicionQuery } from "./ListarSesionesOperativasExpedicionQuery.js";
import { ObtenerSesionOperativaQuery } from "./ObtenerSesionOperativaQuery.js";

/**
 * Factory de queries Execution BC.
 * Runtime: inyectar OperationalSessionRepository.
 *
 * @param {{
 *   operationalSessionRepository?: import('../repositories/InMemoryOperationalSessionRepository.js').InMemoryOperationalSessionRepository
 *     | import('../repositories/OperationalSessionRepository.js').OperationalSessionRepository,
 * }} [deps]
 */
export function createExecutionQueries(deps = {}) {
  const sessionRepo =
    deps.operationalSessionRepository ?? new InMemoryOperationalSessionRepository();

  return {
    obtenerSesionOperativaActiva: new ObtenerSesionOperativaActivaQuery(sessionRepo),
    listarSesionesOperativasExpedicion: new ListarSesionesOperativasExpedicionQuery(sessionRepo),
    obtenerSesionOperativa: new ObtenerSesionOperativaQuery(sessionRepo),
  };
}
