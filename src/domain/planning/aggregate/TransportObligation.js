import { TRANSPORT_OBLIGATION_STATE } from "../constants/EstadosTransportObligation.js";
import { TRANSPORT_OBLIGATION_EVENT, createTransportObligationDomainEvent } from "../constants/EventosTransportObligation.js";
import { PLANNING_DOMAIN_SCHEMA_VERSION } from "../constants/PlanningDomainSchemaVersion.js";
import {
  assertCanCancelTransportObligation,
  assertCanLinkExpedition,
  assertCanReplanTransportObligation,
  assertCanTransitionTransportObligation,
  suggestStateAfterExpeditionLinked,
} from "../rules/transportObligationRules.js";

/**
 * @param {string} [id]
 * @returns {string}
 */
export function generateTransportObligationId(id) {
  if (id) return id;
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `to-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Crea una obligación logística nueva en estado RECEIVED.
 *
 * @param {{
 *   id?: string,
 *   empresaId?: string|null,
 *   externalReference?: import('../types/transportObligation.types.js').ExternalReference|null,
 *   lines?: import('../types/transportObligation.types.js').TransportObligationLine[],
 *   now?: string,
 * }} [params]
 * @returns {{ obligation: import('../types/transportObligation.types.js').TransportObligation, events: import('../types/transportObligation.types.js').TransportObligationDomainEvent[] }}
 */
export function createTransportObligation(params = {}) {
  const now = params.now || new Date().toISOString();
  const id = generateTransportObligationId(params.id);

  /** @type {import('../types/transportObligation.types.js').TransportObligation} */
  const obligation = {
    id,
    empresaId: params.empresaId ?? null,
    state: TRANSPORT_OBLIGATION_STATE.RECEIVED,
    externalReference: params.externalReference ?? null,
    expeditionIds: [],
    lines: Array.isArray(params.lines) ? [...params.lines] : [],
    parentObligationId: null,
    childObligationIds: [],
    supersededByObligationId: null,
    mergedIntoObligationId: null,
    replanVersion: 0,
    cancelledAt: null,
    fulfilledAt: null,
    createdAt: now,
    updatedAt: now,
    planningDomainSchemaVersion: PLANNING_DOMAIN_SCHEMA_VERSION,
  };

  const events = [
    createTransportObligationDomainEvent(TRANSPORT_OBLIGATION_EVENT.RECEIVED, {
      transportObligationId: id,
      empresaId: obligation.empresaId,
      externalReference: obligation.externalReference,
    }, now),
  ];

  return { obligation, events };
}

/**
 * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
 * @param {string} [now]
 */
export function planTransportObligation(obligation, now) {
  assertCanTransitionTransportObligation(obligation, TRANSPORT_OBLIGATION_STATE.PLANNED);
  const at = now || new Date().toISOString();
  return {
    obligation: {
      ...obligation,
      state: TRANSPORT_OBLIGATION_STATE.PLANNED,
      updatedAt: at,
    },
    events: [
      createTransportObligationDomainEvent(TRANSPORT_OBLIGATION_EVENT.PLANNED, {
        transportObligationId: obligation.id,
      }, at),
    ],
  };
}

/**
 * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
 * @param {string} expeditionId
 * @param {string} [now]
 */
export function linkExpeditionToTransportObligation(obligation, expeditionId, now) {
  assertCanLinkExpedition(obligation, expeditionId);
  const at = now || new Date().toISOString();
  const nextState = suggestStateAfterExpeditionLinked(obligation);
  const stateChanged = nextState !== obligation.state;

  /** @type {import('../types/transportObligation.types.js').TransportObligationDomainEvent[]} */
  const events = [
    createTransportObligationDomainEvent(TRANSPORT_OBLIGATION_EVENT.EXPEDITION_LINKED, {
      transportObligationId: obligation.id,
      expeditionId,
    }, at),
  ];

  if (stateChanged && nextState === TRANSPORT_OBLIGATION_STATE.IN_EXECUTION) {
    events.push(
      createTransportObligationDomainEvent(TRANSPORT_OBLIGATION_EVENT.EXECUTION_STARTED, {
        transportObligationId: obligation.id,
        expeditionId,
      }, at)
    );
  }

  return {
    obligation: {
      ...obligation,
      state: nextState,
      expeditionIds: [...obligation.expeditionIds, expeditionId],
      updatedAt: at,
    },
    events,
  };
}

/**
 * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
 * @param {string} [now]
 */
export function cancelTransportObligation(obligation, now) {
  assertCanCancelTransportObligation(obligation);
  const at = now || new Date().toISOString();
  return {
    obligation: {
      ...obligation,
      state: TRANSPORT_OBLIGATION_STATE.CANCELLED,
      cancelledAt: at,
      updatedAt: at,
    },
    events: [
      createTransportObligationDomainEvent(TRANSPORT_OBLIGATION_EVENT.CANCELLED, {
        transportObligationId: obligation.id,
      }, at),
    ],
  };
}

/**
 * Marca obligación como superseded y devuelve plantilla para la nueva obligación replanificada.
 *
 * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
 * @param {string} [newObligationId]
 * @param {string} [now]
 */
export function replanTransportObligation(obligation, newObligationId, now) {
  assertCanReplanTransportObligation(obligation);
  const at = now || new Date().toISOString();
  const replacementId = generateTransportObligationId(newObligationId);

  const superseded = {
    ...obligation,
    state: TRANSPORT_OBLIGATION_STATE.SUPERSEDED,
    supersededByObligationId: replacementId,
    updatedAt: at,
  };

  const replacement = {
    ...obligation,
    id: replacementId,
    state: TRANSPORT_OBLIGATION_STATE.PLANNED,
    parentObligationId: obligation.id,
    childObligationIds: [],
    supersededByObligationId: null,
    mergedIntoObligationId: null,
    expeditionIds: [],
    replanVersion: obligation.replanVersion + 1,
    cancelledAt: null,
    fulfilledAt: null,
    createdAt: at,
    updatedAt: at,
  };

  return {
    supersededObligation: superseded,
    replacementObligation: replacement,
    events: [
      createTransportObligationDomainEvent(TRANSPORT_OBLIGATION_EVENT.REPLANNED, {
        transportObligationId: obligation.id,
        replacementObligationId: replacementId,
      }, at),
      createTransportObligationDomainEvent(TRANSPORT_OBLIGATION_EVENT.PLANNED, {
        transportObligationId: replacementId,
        replanOf: obligation.id,
      }, at),
    ],
  };
}

/**
 * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
 * @param {string[]} childObligationIds
 * @param {string} [now]
 */
export function splitTransportObligation(obligation, childObligationIds, now) {
  assertCanReplanTransportObligation(obligation);
  if (!Array.isArray(childObligationIds) || childObligationIds.length < 2) {
    throw new Error("Split requires at least two child obligation ids");
  }
  const at = now || new Date().toISOString();
  return {
    obligation: {
      ...obligation,
      state: TRANSPORT_OBLIGATION_STATE.SUPERSEDED,
      childObligationIds: [...childObligationIds],
      updatedAt: at,
    },
    events: [
      createTransportObligationDomainEvent(TRANSPORT_OBLIGATION_EVENT.SPLIT, {
        transportObligationId: obligation.id,
        childObligationIds,
      }, at),
    ],
  };
}

/**
 * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
 * @param {string} targetObligationId
 * @param {string} [now]
 */
export function mergeTransportObligationInto(obligation, targetObligationId, now) {
  assertCanReplanTransportObligation(obligation);
  if (!targetObligationId) {
    throw new Error("Target obligation id is required for merge");
  }
  const at = now || new Date().toISOString();
  return {
    obligation: {
      ...obligation,
      state: TRANSPORT_OBLIGATION_STATE.SUPERSEDED,
      mergedIntoObligationId: targetObligationId,
      updatedAt: at,
    },
    events: [
      createTransportObligationDomainEvent(TRANSPORT_OBLIGATION_EVENT.MERGED, {
        transportObligationId: obligation.id,
        mergedIntoObligationId: targetObligationId,
      }, at),
    ],
  };
}

/**
 * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
 * @param {string} [now]
 */
export function markTransportObligationPartiallyFulfilled(obligation, now) {
  assertCanTransitionTransportObligation(obligation, TRANSPORT_OBLIGATION_STATE.PARTIALLY_FULFILLED);
  const at = now || new Date().toISOString();
  return {
    obligation: {
      ...obligation,
      state: TRANSPORT_OBLIGATION_STATE.PARTIALLY_FULFILLED,
      updatedAt: at,
    },
    events: [
      createTransportObligationDomainEvent(TRANSPORT_OBLIGATION_EVENT.PARTIALLY_FULFILLED, {
        transportObligationId: obligation.id,
      }, at),
    ],
  };
}

/**
 * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
 * @param {string} [now]
 */
export function markTransportObligationFulfilled(obligation, now) {
  assertCanTransitionTransportObligation(obligation, TRANSPORT_OBLIGATION_STATE.FULFILLED);
  const at = now || new Date().toISOString();
  return {
    obligation: {
      ...obligation,
      state: TRANSPORT_OBLIGATION_STATE.FULFILLED,
      fulfilledAt: at,
      updatedAt: at,
    },
    events: [
      createTransportObligationDomainEvent(TRANSPORT_OBLIGATION_EVENT.FULFILLED, {
        transportObligationId: obligation.id,
      }, at),
    ],
  };
}
