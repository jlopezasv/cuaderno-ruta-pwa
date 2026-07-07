import { OPERATIONAL_SESSION_STATE } from "../constants/EstadosOperationalSession.js";
import { OPERATIONAL_SESSION_KIND } from "../constants/TiposOperationalSession.js";
import {
  OPERATIONAL_SESSION_EVENT,
  createOperationalSessionDomainEvent,
} from "../constants/EventosOperationalSession.js";
import { EXECUTION_DOMAIN_SCHEMA_VERSION } from "../constants/ExecutionDomainSchemaVersion.js";
import {
  assertMovementRefNotDuplicate,
  assertSessionAcceptsMovements,
  assertSessionCanBeCancelled,
  assertSessionCanBeClosed,
  assertNoConcurrentOpenSessionAtLocation,
} from "../rules/operationalSessionRules.js";

/**
 * @param {string} [id]
 * @returns {string}
 */
export function generateOperationalSessionId(id) {
  if (id) return id;
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `os-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {{
 *   id?: string,
 *   expeditionId: string,
 *   sessionKind?: string,
 *   location: import('../types/operationalSession.types.js').OperationalSessionLocation,
 *   actor?: import('../types/operationalSession.types.js').OperationalSessionActor,
 *   resources?: import('../types/operationalSession.types.js').OperationalSessionResources,
 *   entryObservation?: string|null,
 *   now?: string,
 * }} params
 */
export function openOperationalSession(params) {
  const now = params.now || new Date().toISOString();
  const id = generateOperationalSessionId(params.id);

  /** @type {import('../types/operationalSession.types.js').OperationalSession} */
  const session = {
    id,
    expeditionId: params.expeditionId,
    state: OPERATIONAL_SESSION_STATE.OPEN,
    sessionKind: params.sessionKind || OPERATIONAL_SESSION_KIND.UNSPECIFIED,
    location: params.location,
    actor: params.actor || { userId: null, role: "conductor" },
    resources: params.resources || { sessionStopId: null, entryGeo: null, exitGeo: null },
    movementRefs: [],
    entryObservation: params.entryObservation ?? null,
    exitObservation: null,
    cancellationReason: null,
    closedWithoutChanges: false,
    durationMinutes: null,
    openedAt: now,
    closedAt: null,
    cancelledAt: null,
    executionDomainSchemaVersion: EXECUTION_DOMAIN_SCHEMA_VERSION,
    isLegacyMuelleSession: false,
  };

  return {
    session,
    events: [
      createOperationalSessionDomainEvent(OPERATIONAL_SESSION_EVENT.OPENED, {
        operationalSessionId: id,
        expeditionId: params.expeditionId,
        sessionKind: session.sessionKind,
        locationName: params.location.name,
      }, now),
    ],
  };
}

/**
 * @param {import('../types/operationalSession.types.js').OperationalSession|null} activeSession
 * @param {Parameters<typeof openOperationalSession>[0]} params
 */
export function openOperationalSessionGuarded(activeSession, params) {
  assertNoConcurrentOpenSessionAtLocation(activeSession, params.location.name);
  return openOperationalSession(params);
}

/**
 * @param {import('../types/operationalSession.types.js').OperationalSession} session
 * @param {import('../types/operationalSession.types.js').SessionMovementRef} movementRef
 * @param {string} [now]
 */
export function registerMovementInOperationalSession(session, movementRef, now) {
  assertSessionAcceptsMovements(session);
  assertMovementRefNotDuplicate(session, movementRef);
  const at = now || new Date().toISOString();

  return {
    session: {
      ...session,
      movementRefs: [
        ...session.movementRefs,
        { ...movementRef, registeredAt: movementRef.registeredAt || at },
      ],
    },
    events: [
      createOperationalSessionDomainEvent(OPERATIONAL_SESSION_EVENT.MOVEMENT_REGISTERED, {
        operationalSessionId: session.id,
        expeditionId: session.expeditionId,
        sessionMovementId: movementRef.sessionMovementId,
        decaMovimientoId: movementRef.decaMovimientoId,
      }, at),
    ],
  };
}

/**
 * @param {import('../types/operationalSession.types.js').OperationalSession} session
 * @param {{ exitObservation?: string|null, closedWithoutChanges?: boolean, durationMinutes?: number|null, exitGeo?: Record<string, unknown>|null, now?: string }} [options]
 */
export function closeOperationalSession(session, options = {}) {
  assertSessionCanBeClosed(session);
  const now = options.now || new Date().toISOString();

  return {
    session: {
      ...session,
      state: OPERATIONAL_SESSION_STATE.CLOSED,
      exitObservation: options.exitObservation ?? session.exitObservation,
      closedWithoutChanges: options.closedWithoutChanges ?? session.closedWithoutChanges,
      durationMinutes: options.durationMinutes ?? session.durationMinutes,
      resources: {
        ...session.resources,
        exitGeo: options.exitGeo ?? session.resources.exitGeo,
      },
      closedAt: now,
    },
    events: [
      createOperationalSessionDomainEvent(OPERATIONAL_SESSION_EVENT.CLOSED, {
        operationalSessionId: session.id,
        expeditionId: session.expeditionId,
        movementCount: session.movementRefs.length,
      }, now),
    ],
  };
}

/**
 * @param {import('../types/operationalSession.types.js').OperationalSession} session
 * @param {string} [reason]
 * @param {string} [now]
 */
export function cancelOperationalSession(session, reason, now) {
  assertSessionCanBeCancelled(session);
  const at = now || new Date().toISOString();

  return {
    session: {
      ...session,
      state: OPERATIONAL_SESSION_STATE.CANCELLED,
      cancellationReason: reason || "Cancelled",
      cancelledAt: at,
    },
    events: [
      createOperationalSessionDomainEvent(OPERATIONAL_SESSION_EVENT.CANCELLED, {
        operationalSessionId: session.id,
        expeditionId: session.expeditionId,
        reason: reason || "Cancelled",
      }, at),
    ],
  };
}
