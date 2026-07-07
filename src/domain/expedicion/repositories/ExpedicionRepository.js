import {
  fetchActiveAutonomoExpediente,
  fetchAutonomoExpedientes,
  loadAutonomoExpedienteWorkspace,
} from "../../../modules/autonomo-expediente/autonomoExpedienteApi.js";
import { toExpedicion } from "../adapters/LegacyServicioAdapter.js";
import { toParadas } from "../adapters/LegacyStopAdapter.js";

/**
 * Fachada de lectura sobre expedición (servicios + workspace autónomo).
 * Delega en infraestructura existente sin alterar contratos ni comportamiento.
 */
export class ExpedicionRepository {
  /**
   * Workspace completo del expediente (servicio, paradas, timeline, evidencias…).
   * @param {string} servicioId
   * @returns {Promise<Awaited<ReturnType<typeof loadAutonomoExpedienteWorkspace>>>}
   */
  async obtenerWorkspace(servicioId) {
    return loadAutonomoExpedienteWorkspace(servicioId);
  }

  /**
   * Fila `servicios` del expediente (vía workspace).
   * @param {string} servicioId
   * @returns {Promise<Record<string, unknown>|null>}
   */
  async obtenerServicio(servicioId) {
    const workspace = await loadAutonomoExpedienteWorkspace(servicioId);
    return workspace?.servicio ?? null;
  }

  /**
   * Vista de dominio de la expedición (lectura).
   * @param {string} servicioId
   * @returns {Promise<import('../types/expedicion.types.js').Expedicion|null>}
   */
  async obtenerExpedicion(servicioId) {
    const servicio = await this.obtenerServicio(servicioId);
    return toExpedicion(servicio);
  }

  /**
   * Workspace enriquecido con proyecciones de dominio (sin mutar datos).
   * @param {string} servicioId
   */
  async obtenerVistaDominio(servicioId) {
    const workspace = await loadAutonomoExpedienteWorkspace(servicioId);
    if (!workspace) return null;
    return {
      ...workspace,
      expedicion: toExpedicion(workspace.servicio),
      paradas: toParadas(workspace.stops),
    };
  }

  /**
   * Expedientes autónomo del conductor.
   * @param {string} uid
   * @param {{ limit?: number }} [options]
   */
  async listarPorConductor(uid, options) {
    return fetchAutonomoExpedientes(uid, options);
  }

  /**
   * Expedición activa del conductor (asignado | en_curso).
   * @param {string} uid
   */
  async obtenerActivaPorConductor(uid) {
    return fetchActiveAutonomoExpediente(uid);
  }
}

/** Instancia por defecto para consumo directo. */
export const expedicionRepository = new ExpedicionRepository();
