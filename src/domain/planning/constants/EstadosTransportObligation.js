/**
 * Ciclo de vida de Transport Obligation (Planning BC).
 * Vocabulario neutro — no acoplado a cliente ni sector.
 */

export const TRANSPORT_OBLIGATION_STATE = Object.freeze({
  /** Recibida de fuente externa; aún no planificada para ejecución. */
  RECEIVED: "received",
  /** Planificada; lista para generar o vincular expediciones. */
  PLANNED: "planned",
  /** Al menos una expedición vinculada en ejecución. */
  IN_EXECUTION: "in_execution",
  /** Parte ejecutada; queda trabajo pendiente. */
  PARTIALLY_FULFILLED: "partially_fulfilled",
  /** Totalmente ejecutada. */
  FULFILLED: "fulfilled",
  /** Cancelada; no se ejecutará. */
  CANCELLED: "cancelled",
  /** Sustituida por replanificación, división o agrupación. */
  SUPERSEDED: "superseded",
});

/** @type {ReadonlySet<string>} */
export const TRANSPORT_OBLIGATION_STATES = new Set(Object.values(TRANSPORT_OBLIGATION_STATE));

/**
 * @param {string|null|undefined} state
 * @returns {boolean}
 */
export function isTransportObligationStateValid(state) {
  return typeof state === "string" && TRANSPORT_OBLIGATION_STATES.has(state);
}

/** Estados terminales — no admiten nuevas expediciones ni replanificación in-place. */
export const TRANSPORT_OBLIGATION_TERMINAL_STATES = Object.freeze([
  TRANSPORT_OBLIGATION_STATE.FULFILLED,
  TRANSPORT_OBLIGATION_STATE.CANCELLED,
  TRANSPORT_OBLIGATION_STATE.SUPERSEDED,
]);

/**
 * @param {string} state
 * @returns {boolean}
 */
export function isTransportObligationTerminal(state) {
  return TRANSPORT_OBLIGATION_TERMINAL_STATES.includes(state);
}
