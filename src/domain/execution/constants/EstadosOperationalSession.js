/**
 * Ciclo de vida de Operational Session (Execution BC).
 * Alias legacy: operacion_muelle estado (abierta | cerrada | anulada).
 */

export const OPERATIONAL_SESSION_STATE = Object.freeze({
  OPEN: "open",
  CLOSED: "closed",
  CANCELLED: "cancelled",
});

/** @type {ReadonlySet<string>} */
export const OPERATIONAL_SESSION_STATES = new Set(Object.values(OPERATIONAL_SESSION_STATE));

/**
 * @param {string|null|undefined} state
 * @returns {boolean}
 */
export function isOperationalSessionStateValid(state) {
  return typeof state === "string" && OPERATIONAL_SESSION_STATES.has(state);
}

/** Estados en los que la sesión acepta nuevos movimientos. */
export const OPERATIONAL_SESSION_MOVEMENT_ACCEPTING_STATES = Object.freeze([
  OPERATIONAL_SESSION_STATE.OPEN,
]);

/**
 * @param {string} state
 * @returns {boolean}
 */
export function operationalSessionAcceptsMovements(state) {
  return OPERATIONAL_SESSION_MOVEMENT_ACCEPTING_STATES.includes(state);
}

/** Mapeo legacy → dominio. */
export const LEGACY_MUELLE_STATE_TO_DOMAIN = Object.freeze({
  abierta: OPERATIONAL_SESSION_STATE.OPEN,
  cerrada: OPERATIONAL_SESSION_STATE.CLOSED,
  anulada: OPERATIONAL_SESSION_STATE.CANCELLED,
});

/**
 * @param {string} legacyState
 * @returns {string}
 */
export function mapLegacyMuelleStateToDomain(legacyState) {
  const key = String(legacyState || "").toLowerCase();
  return LEGACY_MUELLE_STATE_TO_DOMAIN[key] || OPERATIONAL_SESSION_STATE.OPEN;
}
