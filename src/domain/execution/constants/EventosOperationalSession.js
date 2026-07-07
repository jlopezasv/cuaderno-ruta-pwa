/**
 * Eventos de dominio de Operational Session.
 */

export const OPERATIONAL_SESSION_EVENT = Object.freeze({
  OPENED: "OperationalSessionOpened",
  MOVEMENT_REGISTERED: "OperationalSessionMovementRegistered",
  CLOSED: "OperationalSessionClosed",
  CANCELLED: "OperationalSessionCancelled",
});

/**
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @param {string} [occurredAt]
 */
export function createOperationalSessionDomainEvent(type, payload, occurredAt) {
  return {
    type,
    occurredAt: occurredAt || new Date().toISOString(),
    payload: payload && typeof payload === "object" ? { ...payload } : {},
  };
}
