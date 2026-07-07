import { getServicioOperacionMeta } from "../../service/serviceOperacionMeta.js";
import { getHistorialOperacionesMuelle } from "../../../modules/autonomo-expediente/operacionMuelleModel.js";
import { mapLegacyMuelleStateToDomain } from "../constants/EstadosOperationalSession.js";
import { mapLegacyTipoPrevistoToSessionKind } from "../constants/TiposOperationalSession.js";
import { EXECUTION_DOMAIN_SCHEMA_VERSION } from "../constants/ExecutionDomainSchemaVersion.js";
import { MUELLE_ESTADO } from "../../../modules/autonomo-expediente/operacionMuelleModel.js";

/**
 * Extrae referencias de movimiento del espejo JSON de sesión muelle.
 * @param {Array<Record<string, unknown>>|null|undefined} movimientos
 * @returns {import('../types/operationalSession.types.js').SessionMovementRef[]}
 */
export function extractMovementRefsFromLegacyMovimientos(movimientos) {
  if (!Array.isArray(movimientos)) return [];
  return movimientos
    .map((m) => {
      const sessionMovementId = String(m.carga_id || m.id || "");
      if (!sessionMovementId) return null;
      return {
        sessionMovementId,
        decaMovimientoId: m.deca_movimiento_id ? String(m.deca_movimiento_id) : null,
        tipoSesion: m.tipo ? String(m.tipo) : null,
        estado: m.estado ? String(m.estado) : null,
        registeredAt: m.at ? String(m.at) : m.fecha_hora ? String(m.fecha_hora) : null,
      };
    })
    .filter(Boolean);
}

/**
 * @param {Record<string, unknown>} op
 * @param {string} expeditionId
 * @param {string|null} [actorUserId]
 * @returns {import('../types/operationalSession.types.js').OperationalSession}
 */
export function toOperationalSessionFromLegacyOp(op, expeditionId, actorUserId = null) {
  const state = mapLegacyMuelleStateToDomain(op.estado);
  return {
    id: String(op.id || ""),
    expeditionId,
    state,
    sessionKind: mapLegacyTipoPrevistoToSessionKind(
      op.tipo_previsto ? String(op.tipo_previsto) : null
    ),
    location: {
      locationId: null,
      name: String(op.lugar_nombre || op.muelle_nombre || ""),
      address: op.lugar_direccion ? String(op.lugar_direccion) : null,
      role: "dock",
    },
    actor: {
      userId: actorUserId,
      role: "conductor",
    },
    resources: {
      sessionStopId: op.stop_session_id ? String(op.stop_session_id) : null,
      entryGeo: op.entrada_geo && typeof op.entrada_geo === "object" ? op.entrada_geo : null,
      exitGeo: op.salida_geo && typeof op.salida_geo === "object" ? op.salida_geo : null,
    },
    movementRefs: extractMovementRefsFromLegacyMovimientos(
      /** @type {Array<Record<string, unknown>>} */ (op.movimientos)
    ),
    entryObservation: op.observacion_entrada ? String(op.observacion_entrada) : null,
    exitObservation: op.observacion_salida ? String(op.observacion_salida) : null,
    cancellationReason: op.anulacion_motivo ? String(op.anulacion_motivo) : null,
    closedWithoutChanges: op.sin_cambios === true,
    durationMinutes:
      op.minutos_muelle != null
        ? Number(op.minutos_muelle)
        : null,
    openedAt: op.entrada_at ? String(op.entrada_at) : new Date(0).toISOString(),
    closedAt: op.salida_at ? String(op.salida_at) : null,
    cancelledAt: op.anulada_at ? String(op.anulada_at) : null,
    executionDomainSchemaVersion: EXECUTION_DOMAIN_SCHEMA_VERSION,
    isLegacyMuelleSession: true,
  };
}

/**
 * Sesión activa desde fila servicio (solo si operacion_muelle_activa.abierta).
 *
 * @param {Record<string, unknown>|null|undefined} servicio
 * @returns {import('../types/operationalSession.types.js').OperationalSession|null}
 */
export function toOperationalSessionActiveFromServicio(servicio) {
  if (!servicio) return null;
  const meta = getServicioOperacionMeta(servicio);
  const op = meta.operacion_muelle_activa;
  if (!op || typeof op !== "object") return null;
  if (String(op.estado || "").toLowerCase() !== MUELLE_ESTADO.ABIERTA) return null;

  const actorUserId = servicio.conductor_id ? String(servicio.conductor_id) : null;
  return toOperationalSessionFromLegacyOp(
    /** @type {Record<string, unknown>} */ (op),
    String(servicio.id || ""),
    actorUserId
  );
}

/**
 * Historial de sesiones desde meta servicio.
 *
 * @param {Record<string, unknown>|null|undefined} servicio
 * @returns {import('../types/operationalSession.types.js').OperationalSession[]}
 */
export function toOperationalSessionsFromHistorial(servicio) {
  if (!servicio) return [];
  const historial = getHistorialOperacionesMuelle(servicio);
  const actorUserId = servicio.conductor_id ? String(servicio.conductor_id) : null;
  return historial
    .filter((op) => op && typeof op === "object" && op.id)
    .map((op) =>
      toOperationalSessionFromLegacyOp(
        /** @type {Record<string, unknown>} */ (op),
        String(servicio.id || ""),
        actorUserId
      )
    );
}

/**
 * Proyección legacy OperacionMuelle (compat expedicion domain).
 *
 * @param {import('../types/operationalSession.types.js').OperationalSession|null} session
 * @returns {import('../../expedicion/types/expedicion.types.js').OperacionMuelle|null}
 */
export function toLegacyOperacionMuelleProjection(session) {
  if (!session) return null;
  return {
    id: session.id,
    estado:
      session.state === "open"
        ? "abierta"
        : session.state === "closed"
          ? "cerrada"
          : "anulada",
    entradaAt: session.openedAt,
    muelleNombre: session.location.name,
    tipoPrevisto: session.sessionKind,
    movimientos: session.movementRefs.map((ref) => ({
      id: ref.sessionMovementId,
      carga_id: ref.sessionMovementId,
      deca_movimiento_id: ref.decaMovimientoId,
      tipo: ref.tipoSesion,
      estado: ref.estado,
      at: ref.registeredAt,
    })),
  };
}
