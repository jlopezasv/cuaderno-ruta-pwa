import { InMemoryOperationalSessionRepository } from "../repositories/InMemoryOperationalSessionRepository.js";
import { AbrirOperationalSessionCommand } from "./AbrirOperationalSessionCommand.js";
import { CerrarOperationalSessionCommand } from "./CerrarOperationalSessionCommand.js";
import { CancelarOperationalSessionCommand } from "./CancelarOperationalSessionCommand.js";
import { RegistrarMovimientoEnSesionCommand } from "./RegistrarMovimientoEnSesionCommand.js";

/**
 * Factory de commands Execution BC (dominio puro / in-memory por defecto).
 * Escritura legacy muelle sigue en autonomoExpedienteApi hasta migración explícita.
 *
 * @param {{
 *   operationalSessionRepository?: import('../repositories/InMemoryOperationalSessionRepository.js').InMemoryOperationalSessionRepository,
 * }} [deps]
 */
export function createExecutionCommands(deps = {}) {
  const repo = deps.operationalSessionRepository ?? new InMemoryOperationalSessionRepository();

  return {
    abrirOperationalSession: new AbrirOperationalSessionCommand(repo),
    cerrarOperationalSession: new CerrarOperationalSessionCommand(repo),
    cancelarOperationalSession: new CancelarOperationalSessionCommand(repo),
    registrarMovimientoEnSesion: new RegistrarMovimientoEnSesionCommand(repo),
  };
}
