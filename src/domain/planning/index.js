export {
  TRANSPORT_OBLIGATION_STATE,
  TRANSPORT_OBLIGATION_STATES,
  isTransportObligationStateValid,
  isTransportObligationTerminal,
  TRANSPORT_OBLIGATION_TERMINAL_STATES,
} from "./constants/EstadosTransportObligation.js";

export {
  TRANSPORT_OBLIGATION_EVENT,
  createTransportObligationDomainEvent,
} from "./constants/EventosTransportObligation.js";

export {
  PLANNING_DOMAIN_SCHEMA_VERSION,
  PLANNING_DOMAIN_SCHEMA_META_KEY,
  TRANSPORT_OBLIGATION_ID_META_KEY,
} from "./constants/PlanningDomainSchemaVersion.js";

export * from "./types/transportObligation.types.js";

export {
  createTransportObligation,
  planTransportObligation,
  linkExpeditionToTransportObligation,
  cancelTransportObligation,
  replanTransportObligation,
  splitTransportObligation,
  mergeTransportObligationInto,
  markTransportObligationPartiallyFulfilled,
  markTransportObligationFulfilled,
} from "./aggregate/TransportObligation.js";

export {
  rowToTransportObligation,
  transportObligationToRow,
} from "./repositories/TransportObligationRowMapper.js";

export {
  TransportObligationRepository,
  transportObligationRepository,
} from "./repositories/TransportObligationRepository.js";

export {
  InMemoryTransportObligationRepository,
  inMemoryTransportObligationRepository,
} from "./repositories/InMemoryTransportObligationRepository.js";

export {
  getTransportObligationIdFromServicio,
  enrichExpedicionWithTransportObligationId,
} from "./adapters/ExpeditionObligationLinkAdapter.js";

export * from "./queries/index.js";
export * from "./commands/index.js";
export * from "./ports/index.js";
