/**
 * @typedef {import('../constants/EstadosOperationalSession.js').OPERATIONAL_SESSION_STATE} OperationalSessionStateLiteral
 * @typedef {import('../constants/TiposOperationalSession.js').OPERATIONAL_SESSION_KIND} OperationalSessionKindLiteral
 */

/**
 * @typedef {string} OperationalSessionId
 * @typedef {string} ExpeditionId Alias Execution: servicio_id.
 */

/**
 * Ubicación física donde ocurre la sesión.
 *
 * @typedef {Object} OperationalSessionLocation
 * @property {string|null} locationId Catálogo Resource BC (futuro).
 * @property {string} name
 * @property {string|null} address
 * @property {string|null} role dock | plant | border | hub | other
 */

/**
 * Actor responsable de la sesión.
 *
 * @typedef {Object} OperationalSessionActor
 * @property {string|null} userId Conductor u operador.
 * @property {string|null} role conductor | operator | system
 */

/**
 * Recursos asociados a la sesión.
 *
 * @typedef {Object} OperationalSessionResources
 * @property {string|null} sessionStopId Parada espejo (`stops`) si aplica.
 * @property {Record<string, unknown>|null} entryGeo
 * @property {Record<string, unknown>|null} exitGeo
 */

/**
 * Referencia a movimiento dentro de la sesión (espejo sesión + DeCA vivo).
 *
 * @typedef {Object} SessionMovementRef
 * @property {string} sessionMovementId Id en espejo JSON de sesión (carga_id).
 * @property {string|null} decaMovimientoId Id en `deca_movimientos_carga`.
 * @property {string|null} tipoSesion carga | descarga | retorno | …
 * @property {string|null} estado vigente | anulado | …
 * @property {string|null} registeredAt ISO
 */

/**
 * Operational Session — intervalo espacio-temporal sobre una expedición.
 *
 * @typedef {Object} OperationalSession
 * @property {OperationalSessionId} id
 * @property {ExpeditionId} expeditionId
 * @property {OperationalSessionStateLiteral} state
 * @property {OperationalSessionKindLiteral} sessionKind
 * @property {OperationalSessionLocation} location
 * @property {OperationalSessionActor} actor
 * @property {OperationalSessionResources} resources
 * @property {SessionMovementRef[]} movementRefs
 * @property {string|null} entryObservation
 * @property {string|null} exitObservation
 * @property {string|null} cancellationReason
 * @property {boolean} closedWithoutChanges sin_cambios legacy
 * @property {number|null} durationMinutes minutos en ubicación
 * @property {string} openedAt ISO
 * @property {string|null} closedAt ISO
 * @property {string|null} cancelledAt ISO
 * @property {number} executionDomainSchemaVersion
 * @property {boolean} isLegacyMuelleSession Proyección desde operacion_muelle.
 */

/**
 * @typedef {Object} OperationalSessionDomainEvent
 * @property {string} type
 * @property {string} occurredAt ISO
 * @property {Record<string, unknown>} payload
 */

/**
 * Vista cadena Expedición → Sesión → Movimientos (lectura).
 *
 * @typedef {Object} OperationalSessionMovementChain
 * @property {OperationalSession} session
 * @property {SessionMovementRef[]} movementRefs
 * @property {import('../../expedicion/types/expedicion.types.js').MovimientoMercancia[]} movimientos
 */

export {};
