import { transportObligationRepository } from "../repositories/TransportObligationRepository.js";
import { ObtenerTransportObligationQuery } from "./ObtenerTransportObligationQuery.js";
import { ListarTransportObligationsPorEmpresaQuery } from "./ListarTransportObligationsPorEmpresaQuery.js";
import { ObtenerObligationPorExpedicionQuery } from "./ObtenerObligationPorExpedicionQuery.js";

/**
 * Factory con repositorio Supabase por defecto (runtime).
 * No importar en tests unitarios — inyectar InMemoryTransportObligationRepository.
 *
 * @param {{
 *   transportObligationRepository?: import('../repositories/TransportObligationRepository.js').TransportObligationRepository
 *     | import('../repositories/InMemoryTransportObligationRepository.js').InMemoryTransportObligationRepository,
 * }} [deps]
 */
export function createPlanningQueries(deps = {}) {
  const repo = deps.transportObligationRepository ?? transportObligationRepository;

  return {
    obtenerTransportObligation: new ObtenerTransportObligationQuery(repo),
    listarTransportObligationsPorEmpresa: new ListarTransportObligationsPorEmpresaQuery(repo),
    obtenerObligationPorExpedicion: new ObtenerObligationPorExpedicionQuery(repo),
  };
}
