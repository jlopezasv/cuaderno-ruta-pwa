import { expedicionRepository } from "../repositories/ExpedicionRepository.js";
import { inventarioRepository } from "../repositories/InventarioRepository.js";
import { movimientoRepository } from "../repositories/MovimientoRepository.js";
import { ObtenerExpedicionQuery } from "./ObtenerExpedicionQuery.js";
import { ObtenerExpedicionWorkspaceQuery } from "./ObtenerExpedicionWorkspaceQuery.js";
import { ListarExpedicionesConductorQuery } from "./ListarExpedicionesConductorQuery.js";
import { ObtenerExpedicionActivaConductorQuery } from "./ObtenerExpedicionActivaConductorQuery.js";
import { ObtenerOperacionMuelleActivaQuery } from "./ObtenerOperacionMuelleActivaQuery.js";
import { ObtenerInventarioActualQuery } from "./ObtenerInventarioActualQuery.js";
import { ObtenerInventarioVivoQuery } from "./ObtenerInventarioVivoQuery.js";
import { ListarMovimientosExpedicionQuery } from "./ListarMovimientosExpedicionQuery.js";
import { ObtenerMovimientosPorParadaQuery } from "./ObtenerMovimientosPorParadaQuery.js";
import { ObtenerHistoricoVersionesDecaQuery } from "./ObtenerHistoricoVersionesDecaQuery.js";

/**
 * Factory con repositorios por defecto (uso en runtime; no importar en tests unitarios).
 * @param {{
 *   expedicionRepository?: import('../repositories/ExpedicionRepository.js').ExpedicionRepository,
 *   inventarioRepository?: import('../repositories/InventarioRepository.js').InventarioRepository,
 *   movimientoRepository?: import('../repositories/MovimientoRepository.js').MovimientoRepository,
 * }} [deps]
 */
export function createExpedicionQueries(deps = {}) {
  const expRepo = deps.expedicionRepository ?? expedicionRepository;
  const invRepo = deps.inventarioRepository ?? inventarioRepository;
  const movRepo = deps.movimientoRepository ?? movimientoRepository;

  return {
    obtenerExpedicion: new ObtenerExpedicionQuery(expRepo),
    obtenerExpedicionWorkspace: new ObtenerExpedicionWorkspaceQuery(expRepo),
    listarExpedicionesConductor: new ListarExpedicionesConductorQuery(expRepo),
    obtenerExpedicionActivaConductor: new ObtenerExpedicionActivaConductorQuery(expRepo),
    obtenerOperacionMuelleActiva: new ObtenerOperacionMuelleActivaQuery(expRepo),
    obtenerInventarioActual: new ObtenerInventarioActualQuery(invRepo),
    obtenerInventarioVivo: new ObtenerInventarioVivoQuery(invRepo),
    listarMovimientosExpedicion: new ListarMovimientosExpedicionQuery(invRepo),
    obtenerMovimientosPorParada: new ObtenerMovimientosPorParadaQuery(movRepo),
    obtenerHistoricoVersionesDeca: new ObtenerHistoricoVersionesDecaQuery(movRepo),
  };
}
