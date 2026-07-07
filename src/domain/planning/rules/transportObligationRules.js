import { BusinessRuleError } from "../../shared/BusinessRuleError.js";
import {
  TRANSPORT_OBLIGATION_STATE,
  isTransportObligationTerminal,
} from "../constants/EstadosTransportObligation.js";

/** @type {Readonly<Record<string, ReadonlySet<string>>>} */
const ALLOWED_TRANSITIONS = Object.freeze({
  [TRANSPORT_OBLIGATION_STATE.RECEIVED]: new Set([
    TRANSPORT_OBLIGATION_STATE.PLANNED,
    TRANSPORT_OBLIGATION_STATE.CANCELLED,
    TRANSPORT_OBLIGATION_STATE.SUPERSEDED,
  ]),
  [TRANSPORT_OBLIGATION_STATE.PLANNED]: new Set([
    TRANSPORT_OBLIGATION_STATE.IN_EXECUTION,
    TRANSPORT_OBLIGATION_STATE.CANCELLED,
    TRANSPORT_OBLIGATION_STATE.SUPERSEDED,
  ]),
  [TRANSPORT_OBLIGATION_STATE.IN_EXECUTION]: new Set([
    TRANSPORT_OBLIGATION_STATE.PARTIALLY_FULFILLED,
    TRANSPORT_OBLIGATION_STATE.FULFILLED,
    TRANSPORT_OBLIGATION_STATE.CANCELLED,
    TRANSPORT_OBLIGATION_STATE.SUPERSEDED,
  ]),
  [TRANSPORT_OBLIGATION_STATE.PARTIALLY_FULFILLED]: new Set([
    TRANSPORT_OBLIGATION_STATE.IN_EXECUTION,
    TRANSPORT_OBLIGATION_STATE.FULFILLED,
    TRANSPORT_OBLIGATION_STATE.CANCELLED,
    TRANSPORT_OBLIGATION_STATE.SUPERSEDED,
  ]),
  [TRANSPORT_OBLIGATION_STATE.FULFILLED]: new Set(),
  [TRANSPORT_OBLIGATION_STATE.CANCELLED]: new Set(),
  [TRANSPORT_OBLIGATION_STATE.SUPERSEDED]: new Set(),
});

/**
 * @param {string} fromState
 * @param {string} toState
 * @returns {boolean}
 */
export function canTransitionTransportObligation(fromState, toState) {
  const allowed = ALLOWED_TRANSITIONS[fromState];
  return Boolean(allowed && allowed.has(toState));
}

/**
 * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
 * @param {string} toState
 */
export function assertCanTransitionTransportObligation(obligation, toState) {
  if (!obligation) {
    throw new BusinessRuleError("Transport obligation is required", "TO-R01");
  }
  if (!canTransitionTransportObligation(obligation.state, toState)) {
    throw new BusinessRuleError(
      `Cannot transition obligation from ${obligation.state} to ${toState}`,
      "TO-R02"
    );
  }
}

/**
 * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
 * @param {string} expeditionId
 */
export function assertCanLinkExpedition(obligation, expeditionId) {
  if (!obligation) {
    throw new BusinessRuleError("Transport obligation is required", "TO-R03");
  }
  if (isTransportObligationTerminal(obligation.state)) {
    throw new BusinessRuleError(
      `Cannot link expedition to obligation in terminal state ${obligation.state}`,
      "TO-R04"
    );
  }
  if (!expeditionId) {
    throw new BusinessRuleError("Expedition id is required", "TO-R05");
  }
  if (obligation.expeditionIds.includes(expeditionId)) {
    throw new BusinessRuleError(
      `Expedition ${expeditionId} is already linked to this obligation`,
      "TO-R06"
    );
  }
}

/**
 * Una expedición solo puede pertenecer a una obligación (INV Planning).
 *
 * @param {import('../types/transportObligation.types.js').ExpeditionObligationLink|null|undefined} existingLink
 * @param {string} expeditionId
 */
export function assertExpeditionNotAlreadyLinked(existingLink, expeditionId) {
  if (existingLink && existingLink.expeditionId === expeditionId) {
    throw new BusinessRuleError(
      `Expedition ${expeditionId} is already linked to obligation ${existingLink.transportObligationId}`,
      "TO-R07"
    );
  }
}

/**
 * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
 */
export function assertCanCancelTransportObligation(obligation) {
  if (!obligation) {
    throw new BusinessRuleError("Transport obligation is required", "TO-R08");
  }
  if (isTransportObligationTerminal(obligation.state)) {
    throw new BusinessRuleError(
      `Cannot cancel obligation in state ${obligation.state}`,
      "TO-R09"
    );
  }
}

/**
 * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
 */
export function assertCanReplanTransportObligation(obligation) {
  if (!obligation) {
    throw new BusinessRuleError("Transport obligation is required", "TO-R10");
  }
  if (isTransportObligationTerminal(obligation.state)) {
    throw new BusinessRuleError(
      `Cannot replan obligation in terminal state ${obligation.state}`,
      "TO-R11"
    );
  }
}

/**
 * Deriva estado sugerido tras vincular expedición (sin consultar Execution).
 *
 * @param {import('../types/transportObligation.types.js').TransportObligation} obligation
 * @returns {string}
 */
export function suggestStateAfterExpeditionLinked(obligation) {
  if (
    obligation.state === TRANSPORT_OBLIGATION_STATE.RECEIVED ||
    obligation.state === TRANSPORT_OBLIGATION_STATE.PLANNED
  ) {
    return TRANSPORT_OBLIGATION_STATE.IN_EXECUTION;
  }
  return obligation.state;
}
