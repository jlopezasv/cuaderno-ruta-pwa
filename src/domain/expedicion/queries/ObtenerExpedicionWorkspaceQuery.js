import { toExpedicion, toOperacionMuelleActiva } from "../adapters/LegacyServicioAdapter.js";
import { toParada } from "../adapters/LegacyStopAdapter.js";
import { toEventosTimeline } from "../adapters/LegacyInventarioAdapter.js";

/**
 * Workspace completo del agregado Expedición (solo objetos de dominio).
 */
export class ObtenerExpedicionWorkspaceQuery {
  /**
   * @param {import('../repositories/ExpedicionRepository.js').ExpedicionRepository} [repository]
   */
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {string} servicioId
   * @returns {Promise<import('../types/expedicion.types.js').ExpedicionWorkspace|null>}
   */
  async execute(servicioId) {
    if (!servicioId) return null;

    const workspace = await this.repository.obtenerWorkspace(servicioId);
    if (!workspace?.servicio) return null;

    const mapParadas = (rows) =>
      (Array.isArray(rows) ? rows : []).map(toParada).filter(Boolean);

    return {
      expedicion: toExpedicion(workspace.servicio),
      paradas: mapParadas(workspace.stops),
      cargas: mapParadas(workspace.cargas),
      destinos: mapParadas(workspace.destinos),
      operacionMuelle: toOperacionMuelleActiva(workspace.servicio),
      timeline: toEventosTimeline(workspace.timeline),
    };
  }
}
