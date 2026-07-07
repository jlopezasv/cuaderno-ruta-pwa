import {
  anularMovimientoCarga,
  editarMovimientoCarga,
  fetchDecaMovimientos,
  fetchDecaVersionesHistorial,
  insertarMovimientoCarga,
  registrarMovimientoCarga,
} from "../../dcdt/decaVivoModel.js";

/**
 * Fachada sobre movimientos DeCA vivo (lectura y escritura).
 * Delega en decaVivoModel sin alterar reglas ni contratos RPC.
 */
export class MovimientoRepository {
  /**
   * Registra movimiento (FASE A + FASE B no bloqueante).
   * @param {object} payload
   * @param {Array<object>} [stockActual]
   */
  async registrarMovimiento(payload, stockActual = []) {
    return registrarMovimientoCarga(payload, stockActual);
  }

  /**
   * Inserta movimiento sin bloquear por DeCA (FASE A).
   * @param {object} payload
   * @param {Array<object>} [stockActual]
   */
  async insertarMovimiento(payload, stockActual = []) {
    return insertarMovimientoCarga(payload, stockActual);
  }

  /**
   * Edita movimiento existente.
   * @param {string} movimientoId
   * @param {object} payload
   */
  async editarMovimiento(movimientoId, payload) {
    return editarMovimientoCarga(movimientoId, payload);
  }

  /**
   * Anula movimiento existente.
   * @param {string} movimientoId
   */
  async anularMovimiento(movimientoId) {
    return anularMovimientoCarga(movimientoId);
  }

  /**
   * Lista todos los movimientos del servicio.
   * @param {string} servicioId
   */
  async listarMovimientos(servicioId) {
    return fetchDecaMovimientos(servicioId);
  }

  /**
   * Histórico de versiones DeCA del servicio.
   * @param {string} servicioId
   */
  async obtenerHistoricoVersiones(servicioId) {
    return fetchDecaVersionesHistorial(servicioId);
  }

  /**
   * Movimientos asociados a una parada (`parada_id`).
   * @param {string} servicioId
   * @param {string} paradaId
   */
  async obtenerMovimientosPorParada(servicioId, paradaId) {
    const movimientos = await fetchDecaMovimientos(servicioId);
    if (!paradaId) return movimientos;
    return movimientos.filter((m) => String(m.parada_id || "") === String(paradaId));
  }
}

export const movimientoRepository = new MovimientoRepository();
