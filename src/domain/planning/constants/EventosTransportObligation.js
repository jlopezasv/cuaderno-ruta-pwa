/**
 * Eventos de dominio del agregado Transport Obligation.
 * Append-only en proyección futura; por ahora retornados por commands.
 */

export const TRANSPORT_OBLIGATION_EVENT = Object.freeze({
  RECEIVED: "TransportObligationReceived",
  PLANNED: "TransportObligationPlanned",
  EXPEDITION_LINKED: "ExpeditionLinkedToTransportObligation",
  EXPEDITION_UNLINKED: "ExpeditionUnlinkedFromTransportObligation",
  EXECUTION_STARTED: "TransportObligationExecutionStarted",
  PARTIALLY_FULFILLED: "TransportObligationPartiallyFulfilled",
  FULFILLED: "TransportObligationFulfilled",
  CANCELLED: "TransportObligationCancelled",
  REPLANNED: "TransportObligationReplanned",
  SPLIT: "TransportObligationSplit",
  MERGED: "TransportObligationMerged",
});

/**
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @param {string} [occurredAt]
 * @returns {{ type: string, occurredAt: string, payload: Record<string, unknown> }}
 */
export function createTransportObligationDomainEvent(type, payload, occurredAt) {
  return {
    type,
    occurredAt: occurredAt || new Date().toISOString(),
    payload: payload && typeof payload === "object" ? { ...payload } : {},
  };
}
