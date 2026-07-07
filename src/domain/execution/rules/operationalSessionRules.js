import { BusinessRuleError } from "../../shared/BusinessRuleError.js";
import {
  OPERATIONAL_SESSION_STATE,
  operationalSessionAcceptsMovements,
} from "../constants/EstadosOperationalSession.js";

/**
 * @param {import('../types/operationalSession.types.js').OperationalSession|null|undefined} session
 * @param {string} expeditionId
 */
export function assertSessionBelongsToExpedition(session, expeditionId) {
  if (!session) {
    throw new BusinessRuleError("Operational session is required", "OS-R01");
  }
  if (session.expeditionId !== expeditionId) {
    throw new BusinessRuleError(
      `Session ${session.id} does not belong to expedition ${expeditionId}`,
      "OS-R02"
    );
  }
}

/**
 * @param {import('../types/operationalSession.types.js').OperationalSession|null|undefined} activeSession
 * @param {string} locationName
 */
export function assertNoConcurrentOpenSessionAtLocation(activeSession, locationName) {
  if (
    activeSession &&
    activeSession.state === OPERATIONAL_SESSION_STATE.OPEN &&
    activeSession.location.name === locationName
  ) {
    throw new BusinessRuleError(
      `An open session already exists at ${locationName}`,
      "OS-R03"
    );
  }
}

/**
 * @param {import('../types/operationalSession.types.js').OperationalSession} session
 */
export function assertSessionAcceptsMovements(session) {
  if (!operationalSessionAcceptsMovements(session.state)) {
    throw new BusinessRuleError(
      `Session ${session.id} in state ${session.state} cannot accept movements`,
      "OS-R04"
    );
  }
}

/**
 * @param {import('../types/operationalSession.types.js').OperationalSession} session
 */
export function assertSessionCanBeCancelled(session) {
  if (session.state !== OPERATIONAL_SESSION_STATE.OPEN) {
    throw new BusinessRuleError(
      `Only open sessions can be cancelled; current state: ${session.state}`,
      "OS-R05"
    );
  }
}

/**
 * @param {import('../types/operationalSession.types.js').OperationalSession} session
 */
export function assertSessionCanBeClosed(session) {
  if (session.state !== OPERATIONAL_SESSION_STATE.OPEN) {
    throw new BusinessRuleError(
      `Only open sessions can be closed; current state: ${session.state}`,
      "OS-R06"
    );
  }
}

/**
 * @param {import('../types/operationalSession.types.js').SessionMovementRef} movementRef
 * @param {import('../types/operationalSession.types.js').OperationalSession} session
 */
export function assertMovementRefNotDuplicate(session, movementRef) {
  const exists = session.movementRefs.some(
    (ref) =>
      ref.sessionMovementId === movementRef.sessionMovementId ||
      (movementRef.decaMovimientoId &&
        ref.decaMovimientoId === movementRef.decaMovimientoId)
  );
  if (exists) {
    throw new BusinessRuleError(
      `Movement ref already registered in session ${session.id}`,
      "OS-R07"
    );
  }
}
